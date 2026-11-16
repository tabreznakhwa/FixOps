-- Annual leave is unpaid for every calendar day in its approved range,
-- including Friday. Sick and compensation leave continue to skip Friday as
-- the weekly off. Public holidays remain excluded for all leave types.
--
-- Existing approved leave remains immutable; new submissions/approvals use
-- the new calendar rule.

create or replace function public.submit_leave_application(
  p_org_id uuid,
  p_staff_id uuid,
  p_submitter_id uuid,
  p_leave_type text,
  p_start_date date,
  p_end_date date,
  p_reason text,
  p_idempotency_key text default null
)
returns table(
  application public.leave_applications,
  created boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.leave_applications%rowtype;
  v_staff public.staff%rowtype;
  v_dates date[];
  v_reason text := btrim(p_reason);
  v_key text := nullif(btrim(p_idempotency_key), '');
begin
  if p_org_id is null or p_staff_id is null or p_submitter_id is null then
    raise exception 'Unauthorized';
  end if;
  if p_leave_type is null
     or p_leave_type not in ('annual_leave', 'sick_leave', 'compensation_leave') then
    raise exception 'Select a valid leave type';
  end if;
  if p_start_date is null or p_end_date is null then
    raise exception 'Start and end dates are required';
  end if;
  if p_end_date < p_start_date then
    raise exception 'End date cannot be before start date';
  end if;
  if p_end_date - p_start_date > 365 then
    raise exception 'A leave application cannot span more than 366 calendar days';
  end if;
  if v_reason is null or char_length(v_reason) not between 3 and 1000 then
    raise exception 'Reason must be between 3 and 1,000 characters';
  end if;
  if v_key is not null and char_length(v_key) > 200 then
    raise exception 'Invalid request key';
  end if;

  if not exists (
    select 1
    from public.users
    where id = p_submitter_id
      and organization_id = p_org_id
      and status = 'active'
  ) then
    raise exception 'Unauthorized';
  end if;

  -- Return a committed retry before applying validations that can change with
  -- time or calendar state.
  if v_key is not null then
    select * into v_request
    from public.leave_applications
    where organization_id = p_org_id
      and staff_id = p_staff_id
      and idempotency_key = v_key;

    if found then
      if v_request.leave_type <> p_leave_type
         or v_request.start_date <> p_start_date
         or v_request.end_date <> p_end_date
         or v_request.reason <> v_reason then
        raise exception 'This request key was already used for a different leave application';
      end if;
      return query select v_request, false;
      return;
    end if;
  end if;

  if p_start_date < (now() at time zone 'Asia/Kuwait')::date then
    raise exception 'Leave applications cannot start in the past';
  end if;

  -- Every leave/payroll path takes month locks before staff or attendance locks.
  -- Revalidate employment after the lock because payroll can be waiting on the
  -- same employee row in the opposite direction otherwise.
  perform public.lock_leave_payroll_months(p_org_id, p_start_date, p_end_date);

  -- Attendance is always locked before staff in leave/payroll workflows. This
  -- matches normal attendance writes, whose FK checks reach staff afterwards.
  lock table public.attendance in share row exclusive mode;

  select * into v_staff
  from public.staff
  where id = p_staff_id
    and organization_id = p_org_id
    and user_id = p_submitter_id
    and employment_status = 'active'
  for update;

  if not found then
    raise exception 'Your login is not linked to an active staff profile';
  end if;
  if p_start_date < v_staff.joining_date then
    raise exception 'Leave cannot begin before your joining date (%)', v_staff.joining_date;
  end if;

  select coalesce(array_agg(day::date order by day), array[]::date[])
  into v_dates
  from generate_series(p_start_date, p_end_date, interval '1 day') as day
  where (p_leave_type = 'annual_leave' or extract(isodow from day) <> 5)
    and not exists (
      select 1
      from public.attendance holiday
      where holiday.organization_id = p_org_id
        and holiday.date = day::date
        and holiday.is_public_holiday
    );

  if cardinality(v_dates) < 1 then
    raise exception 'The selected range contains no working days';
  end if;

  if exists (
    select 1
    from unnest(v_dates) as working_date
    join public.salary_runs run
      on run.organization_id = p_org_id
     and run.salary_year = extract(year from working_date)::integer
     and run.salary_month = extract(month from working_date)::integer
  ) then
    raise exception 'Payroll has already been processed for part of this leave period';
  end if;

  insert into public.leave_applications (
    organization_id,
    staff_id,
    leave_type,
    start_date,
    end_date,
    requested_days,
    reason,
    submitted_by,
    idempotency_key
  ) values (
    p_org_id,
    p_staff_id,
    p_leave_type,
    p_start_date,
    p_end_date,
    cardinality(v_dates),
    v_reason,
    p_submitter_id,
    v_key
  )
  returning * into v_request;

  return query select v_request, true;
  return;
exception
  when unique_violation then
    if v_key is null then
      raise;
    end if;

    select * into v_request
    from public.leave_applications
    where organization_id = p_org_id
      and staff_id = p_staff_id
      and idempotency_key = v_key;

    if not found then
      raise;
    end if;
    if v_request.leave_type <> p_leave_type
       or v_request.start_date <> p_start_date
       or v_request.end_date <> p_end_date
       or v_request.reason <> v_reason then
      raise exception 'This request key was already used for a different leave application';
    end if;
    return query select v_request, false;
    return;
end;
$$;

revoke all on function public.submit_leave_application(
  uuid, uuid, uuid, text, date, date, text, text
) from public;
revoke all on function public.submit_leave_application(
  uuid, uuid, uuid, text, date, date, text, text
) from anon;
revoke all on function public.submit_leave_application(
  uuid, uuid, uuid, text, date, date, text, text
) from authenticated;
grant execute on function public.submit_leave_application(
  uuid, uuid, uuid, text, date, date, text, text
) to service_role;

create or replace function public.review_leave_application(
  p_application_id uuid,
  p_org_id uuid,
  p_reviewer_id uuid,
  p_decision text,
  p_review_note text default null
)
returns table(
  application public.leave_applications,
  changed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.leave_applications%rowtype;
  v_staff_status text;
  v_date date;
  v_dates date[];
  v_status text;
  v_conflicts text[] := array[]::text[];
  v_existing public.attendance%rowtype;
  v_previous_bypass text;
begin
  if p_application_id is null or p_org_id is null or p_reviewer_id is null then
    raise exception 'Unauthorized';
  end if;
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;
  if p_review_note is not null and char_length(p_review_note) > 1000 then
    raise exception 'Review note must be 1,000 characters or fewer';
  end if;
  if p_decision = 'rejected' and nullif(btrim(p_review_note), '') is null then
    raise exception 'A rejection reason is required';
  end if;

  if not exists (
    select 1
    from public.users
    where id = p_reviewer_id
      and organization_id = p_org_id
      and status = 'active'
      and role in ('owner', 'admin')
  ) then
    raise exception 'Only an owner or admin can review leave applications';
  end if;

  select * into v_request
  from public.leave_applications
  where id = p_application_id
    and organization_id = p_org_id
  for update;

  if not found then
    raise exception 'Leave application not found';
  end if;
  if v_request.status = p_decision then
    return query select v_request, false;
    return;
  end if;
  if v_request.status <> 'pending' then
    raise exception 'Only pending leave applications can be reviewed';
  end if;

  if p_decision = 'rejected' then
    update public.leave_applications set
      status = 'rejected',
      reviewed_by = p_reviewer_id,
      reviewed_at = now(),
      review_note = btrim(p_review_note),
      updated_at = now()
    where id = v_request.id
    returning * into v_request;
    return query select v_request, true;
    return;
  end if;

  perform public.lock_leave_payroll_months(
    p_org_id,
    v_request.start_date,
    v_request.end_date
  );

  lock table public.attendance in share row exclusive mode;

  select employment_status into v_staff_status
  from public.staff
  where id = v_request.staff_id
    and organization_id = p_org_id
  for update;

  if not found then
    raise exception 'Employee not found in this organization';
  end if;
  if v_staff_status <> 'active' then
    raise exception 'Leave can only be approved for an active employee';
  end if;

  select coalesce(array_agg(day::date order by day), array[]::date[])
  into v_dates
  from generate_series(
    v_request.start_date,
    v_request.end_date,
    interval '1 day'
  ) as day
  where (
      v_request.leave_type = 'annual_leave'
      or extract(isodow from day) <> 5
    )
    and not exists (
      select 1
      from public.attendance holiday
      where holiday.organization_id = p_org_id
        and holiday.date = day::date
        and holiday.is_public_holiday
    );

  v_request.requested_days := cardinality(v_dates);
  if v_request.requested_days < 1 then
    raise exception 'The selected range contains no working days';
  end if;

  if exists (
    select 1
    from unnest(v_dates) as leave_date
    join public.salary_runs run
      on run.organization_id = p_org_id
     and run.salary_year = extract(year from leave_date)::integer
     and run.salary_month = extract(month from leave_date)::integer
  ) then
    raise exception 'Payroll has already been processed for part of this leave period';
  end if;

  update public.leave_applications
  set requested_days = v_request.requested_days,
      updated_at = now()
  where id = v_request.id;

  v_status := case v_request.leave_type
    when 'annual_leave' then 'unpaid_leave'
    when 'sick_leave' then 'sick_leave'
    else 'leave'
  end;

  foreach v_date in array v_dates loop
    select * into v_existing
    from public.attendance
    where organization_id = p_org_id
      and staff_id = v_request.staff_id
      and date = v_date
    for update;

    if found
       and v_existing.leave_application_id is distinct from v_request.id
       and not (
         v_existing.status = 'absent'
         and v_existing.notes = 'Auto-marked absent — no clock-in recorded'
         and v_existing.check_in is null
         and v_existing.check_out is null
         and coalesce(v_existing.hours_worked, 0) = 0
         and coalesce(v_existing.overtime_hours, 0) = 0
       ) then
      v_conflicts := array_append(v_conflicts, v_date::text);
    end if;
  end loop;

  if coalesce(cardinality(v_conflicts), 0) > 0 then
    raise exception 'Attendance already exists for: %', array_to_string(v_conflicts, ', ')
      using errcode = 'P0001';
  end if;

  v_previous_bypass := coalesce(
    current_setting('fixops.allow_leave_attendance_write', true),
    ''
  );

  begin
    perform set_config('fixops.allow_leave_attendance_write', 'true', true);

    foreach v_date in array v_dates loop
      insert into public.attendance (
        organization_id, staff_id, date, check_in, check_out,
        hours_worked, overtime_hours, status, notes,
        is_public_holiday, friday_ot_amount, created_by, leave_application_id
      ) values (
        p_org_id, v_request.staff_id, v_date, null, null,
        0, 0, v_status,
        case v_request.leave_type
          when 'annual_leave' then 'Approved annual leave'
          when 'sick_leave' then 'Approved sick leave'
          else 'Approved compensation leave'
        end,
        false, 0, p_reviewer_id, v_request.id
      )
      on conflict (organization_id, staff_id, date) do nothing;

      if not exists (
        select 1
        from public.attendance
        where organization_id = p_org_id
          and staff_id = v_request.staff_id
          and date = v_date
          and leave_application_id = v_request.id
      ) then
        update public.attendance set
          check_in = null,
          check_out = null,
          hours_worked = 0,
          overtime_hours = 0,
          status = v_status,
          notes = case v_request.leave_type
            when 'annual_leave' then 'Approved annual leave'
            when 'sick_leave' then 'Approved sick leave'
            else 'Approved compensation leave'
          end,
          is_public_holiday = false,
          friday_ot_amount = 0,
          created_by = p_reviewer_id,
          leave_application_id = v_request.id,
          annual_leave_paid_snapshot = false
        where organization_id = p_org_id
          and staff_id = v_request.staff_id
          and date = v_date
          and status = 'absent'
          and notes = 'Auto-marked absent — no clock-in recorded'
          and check_in is null
          and check_out is null
          and coalesce(hours_worked, 0) = 0
          and coalesce(overtime_hours, 0) = 0;

        if not found then
          raise exception 'Attendance changed while approving leave for %', v_date
            using errcode = 'P0001';
        end if;
      end if;
    end loop;

    update public.leave_applications set
      status = 'approved',
      reviewed_by = p_reviewer_id,
      reviewed_at = now(),
      review_note = nullif(btrim(p_review_note), ''),
      updated_at = now()
    where id = v_request.id
    returning * into v_request;

    perform set_config(
      'fixops.allow_leave_attendance_write',
      v_previous_bypass,
      true
    );
  exception
    when others then
      perform set_config(
        'fixops.allow_leave_attendance_write',
        v_previous_bypass,
        true
      );
      raise;
  end;

  return query select v_request, true;
  return;
end;
$$;

-- Managed annual-leave attendance may now legitimately occur on Friday. The
-- requested-day count still guarantees the approved application and its
-- materialized attendance rows stay in exact agreement.
create or replace function public.validate_managed_leave_attendance()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_application public.leave_applications%rowtype;
  v_expected_note text;
  v_linked_days integer;
begin
  if new.leave_application_id is null then
    return new;
  end if;

  select * into v_application
  from public.leave_applications
  where id = new.leave_application_id;

  if not found
     or v_application.organization_id <> new.organization_id
     or v_application.staff_id <> new.staff_id then
    raise exception 'Managed attendance does not match its leave application';
  end if;

  if v_application.status <> 'approved'
     or new.date not between v_application.start_date and v_application.end_date
     or exists (
       select 1
       from public.attendance holiday
       where holiday.organization_id = new.organization_id
         and holiday.date = new.date
         and holiday.is_public_holiday
         and holiday.id <> new.id
     ) then
    raise exception 'Managed attendance date is not an approved leave day';
  end if;

  v_expected_note := case v_application.leave_type
    when 'annual_leave' then 'Approved annual leave'
    when 'sick_leave' then 'Approved sick leave'
    else 'Approved compensation leave'
  end;

  if (
       (v_application.leave_type = 'annual_leave' and not (
         (new.status = 'unpaid_leave' and not new.annual_leave_paid_snapshot)
         or (new.status = 'leave' and new.annual_leave_paid_snapshot)
       ))
       or (v_application.leave_type = 'sick_leave' and new.status <> 'sick_leave')
       or (v_application.leave_type = 'compensation_leave' and new.status <> 'leave')
     )
     or new.notes is distinct from v_expected_note
     or new.check_in is not null
     or new.check_out is not null
     or coalesce(new.hours_worked, 0) <> 0
     or coalesce(new.overtime_hours, 0) <> 0
     or coalesce(new.friday_ot_amount, 0) <> 0
     or new.is_public_holiday then
    raise exception 'Managed attendance values do not match the approved leave application';
  end if;

  select count(*)::integer into v_linked_days
  from public.attendance attendance_row
  where attendance_row.organization_id = v_application.organization_id
    and attendance_row.staff_id = v_application.staff_id
    and attendance_row.leave_application_id = v_application.id;

  if v_linked_days <> v_application.requested_days then
    raise exception 'Approved leave day count does not match its attendance rows';
  end if;

  return new;
end;
$$;

revoke all on function public.review_leave_application(uuid, uuid, uuid, text, text) from public;
revoke all on function public.review_leave_application(uuid, uuid, uuid, text, text) from anon;
revoke all on function public.review_leave_application(uuid, uuid, uuid, text, text) from authenticated;
grant execute on function public.review_leave_application(uuid, uuid, uuid, text, text)
  to service_role;

revoke all on function public.validate_managed_leave_attendance() from public;
