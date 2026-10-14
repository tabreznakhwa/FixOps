-- Harden leave approvals and the attendance rows they control.
--
-- Attendance writes are server-side in this application. Keeping direct
-- authenticated writes would let any organization member bypass the role checks
-- in the attendance APIs and alter another employee's payroll inputs.
revoke all on public.attendance from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.attendance from authenticated;
grant select on public.attendance to authenticated;
grant select, insert, update, delete on public.attendance to service_role;

-- Encode tenant consistency instead of relying only on service-role callers.
create unique index if not exists idx_staff_org_id_unique
  on public.staff(organization_id, id);
create unique index if not exists idx_users_org_id_unique
  on public.users(organization_id, id);
create unique index if not exists idx_leave_applications_org_staff_id_unique
  on public.leave_applications(organization_id, staff_id, id);

alter table public.leave_applications
  add constraint leave_applications_org_staff_fkey
    foreign key (organization_id, staff_id)
    references public.staff(organization_id, id),
  add constraint leave_applications_org_submitter_fkey
    foreign key (organization_id, submitted_by)
    references public.users(organization_id, id),
  add constraint leave_applications_org_reviewer_fkey
    foreign key (organization_id, reviewed_by)
    references public.users(organization_id, id);

alter table public.attendance
  drop constraint if exists attendance_leave_application_id_fkey,
  add constraint attendance_leave_application_tenant_fkey
    foreign key (organization_id, staff_id, leave_application_id)
    references public.leave_applications(organization_id, staff_id, id)
    on delete restrict;

-- Requests can become zero-day requests only when a public holiday is declared
-- after submission. Approval still refuses a range with no working days.
alter table public.leave_applications
  drop constraint if exists leave_applications_requested_days_check,
  add constraint leave_applications_requested_days_check
    check (requested_days >= 0),
  add constraint leave_applications_date_span_check
    check (end_date - start_date between 0 and 365),
  add constraint leave_applications_reason_length_check
    check (char_length(btrim(reason)) between 3 and 1000),
  add constraint leave_applications_review_note_length_check
    check (review_note is null or char_length(review_note) <= 1000),
  add constraint leave_applications_idempotency_key_length_check
    check (idempotency_key is null or char_length(idempotency_key) between 1 and 200);

create index if not exists idx_leave_applications_staff_dates
  on public.leave_applications(staff_id, start_date, end_date);
create index if not exists idx_leave_applications_submitted_by
  on public.leave_applications(submitted_by);
create index if not exists idx_leave_applications_reviewed_by
  on public.leave_applications(reviewed_by)
  where reviewed_by is not null;

-- Only the approval RPC may create, change, or delete attendance linked to an
-- approved leave request. This also closes the race between an API pre-read and
-- a concurrent approval transaction.
create or replace function public.guard_managed_leave_attendance()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('fixops.allow_leave_attendance_write', true), '') = 'true' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if (tg_op = 'INSERT' and new.leave_application_id is not null)
     or (tg_op = 'UPDATE' and (
       old.leave_application_id is not null
       or new.leave_application_id is not null
     ))
     or (tg_op = 'DELETE' and old.leave_application_id is not null) then
    raise exception
      'Attendance linked to approved leave cannot be changed directly';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.guard_managed_leave_attendance() from public;

create trigger guard_managed_leave_attendance
  before insert or update or delete on public.attendance
  for each row execute function public.guard_managed_leave_attendance();

-- Once approved, the fields that determine materialized attendance are
-- immutable until a dedicated transactional reversal workflow exists.
create or replace function public.guard_approved_leave_application()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_allowed boolean :=
    coalesce(current_setting('fixops.allow_leave_attendance_write', true), '') = 'true';
begin
  if tg_op = 'INSERT' then
    if new.status = 'approved' and not v_allowed then
      raise exception 'Leave applications can only be approved through the review function';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status = 'approved' then
      raise exception 'Approved leave cannot be deleted; use a reversal workflow';
    end if;
    return old;
  end if;

  if new.status is distinct from old.status
     and not (
       old.status = 'pending'
       and new.status in ('rejected', 'cancelled')
     )
     and not v_allowed then
    raise exception 'Leave status can only be changed through an approved workflow';
  end if;

  if old.status = 'approved' and (
    new.status is distinct from old.status
    or new.organization_id is distinct from old.organization_id
    or new.staff_id is distinct from old.staff_id
    or new.leave_type is distinct from old.leave_type
    or new.start_date is distinct from old.start_date
    or new.end_date is distinct from old.end_date
    or new.requested_days is distinct from old.requested_days
  ) and not v_allowed then
    raise exception 'Approved leave cannot be changed; use a reversal workflow';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_approved_leave_application() from public;

create trigger guard_approved_leave_application
  before insert or update or delete on public.leave_applications
  for each row execute function public.guard_approved_leave_application();

-- Reject a public-holiday calendar change that would invalidate already
-- approved leave. Holiday flags remain attendance-backed for compatibility;
-- concurrent flag changes for one organization are serialized here.
create or replace function public.protect_approved_leave_from_holiday_change()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_old_state_change boolean := false;
  v_new_state_change boolean := false;
  v_old_lock bigint;
  v_new_lock bigint;
begin
  if tg_op in ('UPDATE', 'DELETE') and old.is_public_holiday then
    v_old_lock := hashtextextended(
      'fixops.leave_calendar:' || old.organization_id::text,
      0
    );
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.is_public_holiday then
    v_new_lock := hashtextextended(
      'fixops.leave_calendar:' || new.organization_id::text,
      0
    );
  end if;

  if v_old_lock is not null and v_new_lock is not null and v_old_lock <> v_new_lock then
    perform pg_advisory_xact_lock(least(v_old_lock, v_new_lock));
    perform pg_advisory_xact_lock(greatest(v_old_lock, v_new_lock));
  elsif coalesce(v_old_lock, v_new_lock) is not null then
    perform pg_advisory_xact_lock(coalesce(v_old_lock, v_new_lock));
  end if;

  if tg_op in ('UPDATE', 'DELETE')
     and old.is_public_holiday
     and (
       tg_op = 'DELETE'
       or not new.is_public_holiday
       or new.organization_id is distinct from old.organization_id
       or new.date is distinct from old.date
     ) then
    v_old_state_change := not exists (
      select 1
      from public.attendance other
      where other.organization_id = old.organization_id
        and other.date = old.date
        and other.is_public_holiday
        and other.id <> old.id
    );
  end if;

  if tg_op in ('INSERT', 'UPDATE')
     and new.is_public_holiday
     and (
       tg_op = 'INSERT'
       or not old.is_public_holiday
       or new.organization_id is distinct from old.organization_id
       or new.date is distinct from old.date
     ) then
    v_new_state_change := not exists (
      select 1
      from public.attendance other
      where other.organization_id = new.organization_id
        and other.date = new.date
        and other.is_public_holiday
        and (tg_op = 'INSERT' or other.id <> old.id)
    );
  end if;

  if v_old_state_change
     and extract(isodow from old.date) <> 5
     and exists (
       select 1
       from public.leave_applications application
       where application.organization_id = old.organization_id
         and application.status = 'approved'
         and old.date between application.start_date and application.end_date
     ) then
    raise exception
      'Public-holiday status for % cannot be removed because approved leave overlaps that date',
      old.date;
  end if;

  if v_new_state_change
     and extract(isodow from new.date) <> 5
     and exists (
       select 1
       from public.leave_applications application
       where application.organization_id = new.organization_id
         and application.status = 'approved'
         and new.date between application.start_date and application.end_date
     ) then
    raise exception
      'Public-holiday status for % cannot be added because approved leave overlaps that date',
      new.date;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.protect_approved_leave_from_holiday_change() from public;

create trigger protect_approved_leave_from_holiday_change
  before insert or update or delete on public.attendance
  for each row execute function public.protect_approved_leave_from_holiday_change();

-- Validate the final, committed relationship. This is deferred because the
-- approval function creates attendance while the application is still pending,
-- then marks the application approved in the same transaction.
create or replace function public.validate_managed_leave_attendance()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_application public.leave_applications%rowtype;
  v_expected_status text;
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
     or extract(isodow from new.date) = 5
     or exists (
       select 1 from public.attendance holiday
       where holiday.organization_id = new.organization_id
         and holiday.date = new.date
         and holiday.is_public_holiday
         and holiday.id <> new.id
     ) then
    raise exception 'Managed attendance date is not an approved leave working day';
  end if;

  v_expected_status := case
    when v_application.leave_type = 'sick_leave' then 'sick_leave'
    else 'leave'
  end;
  v_expected_note := case v_application.leave_type
    when 'annual_leave' then 'Approved annual leave'
    when 'sick_leave' then 'Approved sick leave'
    else 'Approved compensation leave'
  end;

  if new.status <> v_expected_status
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
  from public.attendance
  where leave_application_id = v_application.id;

  if v_linked_days <> v_application.requested_days then
    raise exception 'Approved leave day count does not match its attendance rows';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_managed_leave_attendance() from public;

create constraint trigger validate_managed_leave_attendance
  after insert or update on public.attendance
  deferrable initially deferred
  for each row
  when (new.leave_application_id is not null)
  execute function public.validate_managed_leave_attendance();

-- Replace the review function with stricter SQL-level validation and one
-- materialized working-date set shared by conflict checks and inserts.
create or replace function public.review_leave_application(
  p_application_id uuid,
  p_org_id uuid,
  p_reviewer_id uuid,
  p_decision text,
  p_review_note text default null
)
returns public.leave_applications
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
    return v_request;
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
    return v_request;
  end if;

  -- Take the attendance table lock before locking staff. Attendance inserts
  -- acquire these in the opposite order through their FK check otherwise.
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

  if exists (
    select 1 from public.salary_runs
    where organization_id = p_org_id
      and daterange(
        make_date(salary_year, salary_month, 1),
        (make_date(salary_year, salary_month, 1)
          + interval '1 month - 1 day')::date,
        '[]'
      ) && daterange(v_request.start_date, v_request.end_date, '[]')
  ) then
    raise exception 'Payroll has already been processed for part of this leave period';
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

  return v_request;
end;
$$;

revoke all on function public.review_leave_application(uuid, uuid, uuid, text, text) from public;
revoke all on function public.review_leave_application(uuid, uuid, uuid, text, text) from anon;
revoke all on function public.review_leave_application(uuid, uuid, uuid, text, text) from authenticated;
grant execute on function public.review_leave_application(uuid, uuid, uuid, text, text)
  to service_role;
