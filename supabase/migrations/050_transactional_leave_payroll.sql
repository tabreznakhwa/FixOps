-- Serialize leave and payroll changes by organization/month and move each
-- multi-table workflow into one database transaction.
--
-- salary_slips.absent_days started as an integer, which cannot faithfully hold
-- half-day attendance. Widen it before the transactional payroll function uses
-- the value as a decimal day count.

alter table public.salary_slips
  alter column absent_days type numeric(6, 2)
  using absent_days::numeric;

create or replace function public.lock_leave_payroll_months(
  p_org_id uuid,
  p_start_date date,
  p_end_date date
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_month date;
begin
  if p_org_id is null or p_start_date is null or p_end_date is null
     or p_end_date < p_start_date then
    raise exception 'Invalid leave/payroll lock range';
  end if;

  for v_month in
    select month_start::date
    from generate_series(
      date_trunc('month', p_start_date)::date,
      date_trunc('month', p_end_date)::date,
      interval '1 month'
    ) as month_start
    order by month_start
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(
        'fixops.leave_payroll:' || p_org_id::text || ':' || to_char(v_month, 'YYYY-MM'),
        0
      )
    );
  end loop;
end;
$$;

revoke all on function public.lock_leave_payroll_months(uuid, date, date) from public;
revoke all on function public.lock_leave_payroll_months(uuid, date, date) from anon;
revoke all on function public.lock_leave_payroll_months(uuid, date, date) from authenticated;
grant execute on function public.lock_leave_payroll_months(uuid, date, date) to service_role;

drop function if exists public.submit_leave_application(
  uuid, uuid, uuid, text, date, date, text, text
);

create function public.submit_leave_application(
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
      and role <> 'attendance_kiosk'
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
  where extract(isodow from day) <> 5
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

revoke all on function public.submit_leave_application(uuid, uuid, uuid, text, date, date, text, text) from public;
revoke all on function public.submit_leave_application(uuid, uuid, uuid, text, date, date, text, text) from anon;
revoke all on function public.submit_leave_application(uuid, uuid, uuid, text, date, date, text, text) from authenticated;
grant execute on function public.submit_leave_application(uuid, uuid, uuid, text, date, date, text, text)
  to service_role;

-- Keep the review behavior from migration 049, but take the same month locks as
-- submission/payroll before checking salary runs or materializing attendance.
drop function if exists public.review_leave_application(
  uuid, uuid, uuid, text, text
);

create function public.review_leave_application(
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
    select 1 from public.users
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

  -- Attendance writers take their table lock before holiday guard triggers run.
  -- Use that same order here; the table lock itself freezes holiday state.
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
  where extract(isodow from day) <> 5
    and not exists (
      select 1 from public.attendance holiday
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
    from unnest(v_dates) as working_date
    join public.salary_runs run
      on run.organization_id = p_org_id
     and run.salary_year = extract(year from working_date)::integer
     and run.salary_month = extract(month from working_date)::integer
  ) then
    raise exception 'Payroll has already been processed for part of this leave period';
  end if;

  update public.leave_applications
  set requested_days = v_request.requested_days,
      updated_at = now()
  where id = v_request.id;

  v_status := case
    when v_request.leave_type = 'sick_leave' then 'sick_leave'
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
      select 1 from public.attendance
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
        leave_application_id = v_request.id
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

  return query select v_request, true;
  return;
end;
$$;

revoke all on function public.review_leave_application(uuid, uuid, uuid, text, text) from public;
revoke all on function public.review_leave_application(uuid, uuid, uuid, text, text) from anon;
revoke all on function public.review_leave_application(uuid, uuid, uuid, text, text) from authenticated;
grant execute on function public.review_leave_application(uuid, uuid, uuid, text, text)
  to service_role;

create or replace function public.process_payroll(
  p_org_id uuid,
  p_processed_by uuid,
  p_month integer,
  p_year integer,
  p_manual_entries jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start_date date;
  v_end_date date;
  v_run_id uuid;
  v_staff_ids uuid[];
  v_staff_count integer;
  v_entry_count integer;
  v_entry_ids integer;
  v_total_basic numeric := 0;
  v_total_allowances numeric := 0;
  v_total_overtime numeric := 0;
  v_total_deductions numeric := 0;
  v_total_net numeric := 0;
  v_staff public.staff%rowtype;
  v_entry jsonb;
  v_food_deduction numeric;
  v_requested_advance_deduction numeric;
  v_advance_deduction numeric;
  v_advance_after numeric;
  v_basic numeric;
  v_allowance numeric;
  v_food numeric;
  v_fixed_ot numeric;
  v_normal_ot numeric;
  v_friday_ot numeric;
  v_absent_days numeric;
  v_absent_deduction numeric;
  v_total_allowance numeric;
  v_total_ot numeric;
  v_gross numeric;
  v_total_absence_deduction numeric;
  v_net numeric;
  v_rows integer;
begin
  if p_org_id is null or p_processed_by is null then
    raise exception 'Forbidden';
  end if;
  if p_month is null or p_month not between 1 and 12
     or p_year is null or p_year not between 2000 and 2100 then
    raise exception 'Enter a valid payroll month and year';
  end if;
  if jsonb_typeof(p_manual_entries) is distinct from 'array' then
    raise exception 'Invalid payroll entries';
  end if;
  if not exists (
    select 1 from public.users
    where id = p_processed_by
      and organization_id = p_org_id
      and status = 'active'
      and role in ('owner', 'admin', 'manager')
  ) then
    raise exception 'Forbidden';
  end if;

  v_start_date := make_date(p_year, p_month, 1);
  v_end_date := (v_start_date + interval '1 month - 1 day')::date;

  perform public.lock_leave_payroll_months(p_org_id, v_start_date, v_end_date);

  if exists (
    select 1 from public.salary_runs
    where organization_id = p_org_id
      and salary_month = p_month
      and salary_year = p_year
  ) then
    raise exception 'Payroll already processed for this month';
  end if;

  if exists (
    select 1 from public.leave_applications
    where organization_id = p_org_id
      and status = 'pending'
      and start_date <= v_end_date
      and end_date >= v_start_date
  ) then
    raise exception 'Cannot process payroll while pending leave applications overlap this month';
  end if;

  -- Freeze attendance and employment before deriving payroll. Attendance comes
  -- first to match ordinary attendance writes and leave approval lock ordering.
  lock table public.attendance in share row exclusive mode;
  lock table public.staff in share row exclusive mode;

  select coalesce(array_agg(employee.id order by employee.id), array[]::uuid[])
  into v_staff_ids
  from public.staff employee
  where employee.organization_id = p_org_id
    and employee.employment_status = 'active'
    and employee.joining_date <= v_end_date;

  v_staff_count := cardinality(v_staff_ids);
  if v_staff_count = 0 then
    raise exception 'No active staff found';
  end if;

  -- Row locks serialize advance balances with issue/repayment workflows.
  perform employee.id
  from public.staff employee
  where employee.organization_id = p_org_id
    and employee.id = any(v_staff_ids)
  order by employee.id
  for update;
  get diagnostics v_rows = row_count;
  if v_rows <> v_staff_count then
    raise exception 'The active employee list changed while payroll was being prepared; reload and try again';
  end if;

  select count(*)::integer, count(distinct entry->>'staff_id')::integer
  into v_entry_count, v_entry_ids
  from jsonb_array_elements(p_manual_entries) as entry;

  if v_entry_count <> v_staff_count or v_entry_ids <> v_staff_count then
    raise exception 'Payroll entries are incomplete or duplicated';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_manual_entries) as entry
    where jsonb_typeof(entry) <> 'object'
      or coalesce(entry->>'staff_id', '')
        !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      or jsonb_typeof(entry->'food_deduction') is distinct from 'number'
      or jsonb_typeof(entry->'advance_deduction') is distinct from 'number'
      or (entry->>'food_deduction')::numeric < 0
      or (entry->>'advance_deduction')::numeric < 0
  ) then
    raise exception 'Invalid payroll entry';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_manual_entries) as entry
    where (entry->>'staff_id')::uuid <> all(v_staff_ids)
  ) then
    raise exception 'A payroll entry does not belong to an active employee in this organization';
  end if;

  if exists (
    select 1
    from unnest(v_staff_ids) as employee(staff_id)
    where not exists (
        select 1 from public.attendance attendance_row
        where attendance_row.organization_id = p_org_id
          and attendance_row.staff_id = employee.staff_id
          and attendance_row.date between v_start_date and v_end_date
      )
  ) then
    raise exception 'Cannot process payroll because an employee has no attendance records this month';
  end if;

  insert into public.salary_runs (
    organization_id,
    salary_month,
    salary_year,
    status,
    total_basic,
    total_allowances,
    total_overtime,
    total_deductions,
    total_net,
    processed_by,
    processed_at
  ) values (
    p_org_id,
    p_month,
    p_year,
    'draft',
    0,
    0,
    0,
    0,
    0,
    p_processed_by,
    now()
  )
  returning id into v_run_id;

  for v_staff in
    select *
    from public.staff
    where organization_id = p_org_id
      and id = any(v_staff_ids)
    order by id
  loop
    select entry into v_entry
    from jsonb_array_elements(p_manual_entries) as entry
    where entry->>'staff_id' = v_staff.id::text;

    v_food_deduction := round((v_entry->>'food_deduction')::numeric, 2);
    v_requested_advance_deduction := round(
      (v_entry->>'advance_deduction')::numeric,
      2
    );
    v_basic := coalesce(v_staff.basic_salary, 0);
    v_allowance := coalesce(v_staff.housing_allowance, 0)
      + coalesce(v_staff.transport_allowance, 0)
      + coalesce(v_staff.other_allowance, 0);
    v_food := coalesce((to_jsonb(v_staff)->>'food_allowance')::numeric, 0);
    v_fixed_ot := case
      when p_month between 3 and 9 and coalesce(v_staff.overtime_eligible, false)
      then coalesce((to_jsonb(v_staff)->>'fixed_overtime_monthly')::numeric, 0)
      else 0
    end;

    select
      coalesce(sum(
        case
          when attendance_row.status = 'absent' then 1
          when attendance_row.status = 'half_day' then 0.5
          else 0
        end
      ), 0),
      coalesce(sum(
        case
          when coalesce(attendance_row.overtime_hours, 0) > 0
               and (
                 extract(isodow from attendance_row.date) = 5
                 or attendance_row.is_public_holiday
                 or coalesce(v_staff.overtime_eligible, false)
               )
          then attendance_row.overtime_hours
          else 0
        end
      ), 0),
      coalesce(sum(
        case
          when (
            extract(isodow from attendance_row.date) = 5
            or attendance_row.is_public_holiday
          )
          and attendance_row.status in ('present', 'half_day')
          then case
            when coalesce(attendance_row.friday_ot_amount, 0) > 0
            then attendance_row.friday_ot_amount
            else coalesce((to_jsonb(v_staff)->>'friday_ot_amount')::numeric, 0)
          end
          else 0
        end
      ), 0)
    into v_absent_days, v_normal_ot, v_friday_ot
    from public.attendance attendance_row
    where attendance_row.organization_id = p_org_id
      and attendance_row.staff_id = v_staff.id
      and attendance_row.date between v_start_date and v_end_date;

    v_normal_ot := round((v_basic / 30 / 8) * v_normal_ot, 2);
    if v_requested_advance_deduction
       > greatest(
         0,
         coalesce((to_jsonb(v_staff)->>'advance_balance')::numeric, 0)
       ) + 0.001 then
      raise exception 'Advance deduction exceeds the outstanding balance for %',
        v_staff.full_name;
    end if;
    v_advance_deduction := v_requested_advance_deduction;
    v_advance_after := greatest(
      0,
      coalesce((to_jsonb(v_staff)->>'advance_balance')::numeric, 0)
        - v_advance_deduction
    );
    v_absent_deduction := round(case
      when v_absent_days > 0
      then ((v_basic + v_allowance + v_fixed_ot) / 30) * v_absent_days
      else 0
    end, 2);
    v_total_allowance := round(v_allowance + v_food, 2);
    v_total_ot := round(v_fixed_ot + v_normal_ot + v_friday_ot, 2);
    v_gross := round(v_basic + v_total_allowance + v_total_ot, 2);
    v_total_absence_deduction := round(
      v_absent_deduction + v_food_deduction,
      2
    );
    v_net := round(
      v_gross - v_advance_deduction - v_total_absence_deduction,
      2
    );

    insert into public.salary_slips (
      organization_id,
      salary_run_id,
      staff_id,
      basic_salary,
      housing_allowance,
      transport_allowance,
      food_allowance,
      other_allowance,
      allowance_name,
      overtime_amount,
      normal_overtime,
      friday_overtime,
      gross_salary,
      absent_days,
      absent_deduction,
      food_deduction,
      deductions,
      advance_deduction,
      advance_balance_after,
      net_salary,
      payment_status
    ) values (
      p_org_id,
      v_run_id,
      v_staff.id,
      v_basic,
      0,
      0,
      v_food,
      coalesce(v_staff.other_allowance, 0),
      coalesce(to_jsonb(v_staff)->>'allowance_name', 'Allowance'),
      v_fixed_ot,
      v_normal_ot,
      v_friday_ot,
      v_gross,
      v_absent_days,
      v_absent_deduction,
      v_food_deduction,
      v_total_absence_deduction,
      v_advance_deduction,
      v_advance_after,
      v_net,
      'pending'
    );

    if v_advance_deduction > 0 then
      update public.staff
      set advance_balance = v_advance_after
      where id = v_staff.id
        and organization_id = p_org_id;
    end if;

    v_total_basic := v_total_basic + v_basic;
    v_total_allowances := v_total_allowances + v_total_allowance;
    v_total_overtime := v_total_overtime + v_total_ot;
    v_total_deductions := v_total_deductions
      + v_advance_deduction + v_total_absence_deduction;
    v_total_net := v_total_net + v_net;
  end loop;

  update public.salary_runs set
    total_basic = v_total_basic,
    total_allowances = v_total_allowances,
    total_overtime = v_total_overtime,
    total_deductions = v_total_deductions,
    total_net = v_total_net
  where id = v_run_id
    and organization_id = p_org_id;

  return v_run_id;
end;
$$;

revoke all on function public.process_payroll(uuid, uuid, integer, integer, jsonb) from public;
revoke all on function public.process_payroll(uuid, uuid, integer, integer, jsonb) from anon;
revoke all on function public.process_payroll(uuid, uuid, integer, integer, jsonb) from authenticated;
grant execute on function public.process_payroll(uuid, uuid, integer, integer, jsonb)
  to service_role;

create or replace function public.reset_payroll_run(
  p_org_id uuid,
  p_reset_by uuid,
  p_run_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.salary_runs%rowtype;
  v_slip record;
begin
  if p_org_id is null or p_reset_by is null or p_run_id is null then
    raise exception 'Only owner or admin can reset a payroll run';
  end if;
  if not exists (
    select 1
    from public.users
    where id = p_reset_by
      and organization_id = p_org_id
      and status = 'active'
      and role in ('owner', 'admin')
  ) then
    raise exception 'Only owner or admin can reset a payroll run';
  end if;

  select * into v_run
  from public.salary_runs
  where id = p_run_id
    and organization_id = p_org_id;

  if not found then
    raise exception 'Payroll run not found';
  end if;

  perform public.lock_leave_payroll_months(
    p_org_id,
    make_date(v_run.salary_year, v_run.salary_month, 1),
    make_date(v_run.salary_year, v_run.salary_month, 1)
  );

  -- The row may have changed while this transaction waited on the month lock.
  select * into v_run
  from public.salary_runs
  where id = p_run_id
    and organization_id = p_org_id
  for update;

  if not found then
    raise exception 'Payroll run not found';
  end if;
  if v_run.status = 'paid' then
    raise exception 'Cannot reset a payroll run that has already been paid out';
  end if;

  -- Match payroll's month -> attendance -> staff order before restoring any
  -- balance. The attendance lock also serializes leave changes for this reset.
  lock table public.attendance in share row exclusive mode;
  lock table public.staff in share row exclusive mode;

  perform employee.id
  from public.staff employee
  join public.salary_slips slip
    on slip.staff_id = employee.id
   and slip.organization_id = p_org_id
   and slip.salary_run_id = p_run_id
  where employee.organization_id = p_org_id
  order by employee.id
  for update of employee;

  for v_slip in
    select staff_id, coalesce(advance_deduction, 0) as advance_deduction
    from public.salary_slips
    where organization_id = p_org_id
      and salary_run_id = p_run_id
      and coalesce(advance_deduction, 0) > 0
    order by staff_id
  loop
    update public.staff
    set advance_balance = coalesce(advance_balance, 0) + v_slip.advance_deduction
    where id = v_slip.staff_id
      and organization_id = p_org_id;

    if not found then
      raise exception 'Employee record is missing while resetting payroll';
    end if;
  end loop;

  -- Remove children explicitly as well as through the FK cascade so reset stays
  -- correct if a legacy deployment lacks ON DELETE CASCADE on this relation.
  delete from public.salary_slips
  where salary_run_id = p_run_id
    and organization_id = p_org_id;

  delete from public.salary_runs
  where id = p_run_id
    and organization_id = p_org_id;
end;
$$;

revoke all on function public.reset_payroll_run(uuid, uuid, uuid) from public;
revoke all on function public.reset_payroll_run(uuid, uuid, uuid) from anon;
revoke all on function public.reset_payroll_run(uuid, uuid, uuid) from authenticated;
grant execute on function public.reset_payroll_run(uuid, uuid, uuid)
  to service_role;
