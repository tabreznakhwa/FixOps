-- Migration 048 intentionally added composite tenant foreign keys, but retained
-- the original single-column relationships. PostgREST then sees more than one
-- leave_applications -> staff/users relationship and refuses unhinted embeds.
-- Keep only the tenant-safe relationship for each reference while preserving
-- staff deletion semantics.
alter table public.leave_applications
  drop constraint if exists leave_applications_staff_id_fkey,
  drop constraint if exists leave_applications_submitted_by_fkey,
  drop constraint if exists leave_applications_reviewed_by_fkey;

alter table public.leave_applications
  drop constraint if exists leave_applications_org_staff_fkey,
  add constraint leave_applications_org_staff_fkey
    foreign key (organization_id, staff_id)
    references public.staff(organization_id, id)
    on delete cascade;

-- Patch the review RPC installed by migration 048. The attendance table lock is
-- taken before the staff-row lock so approval cannot deadlock with a concurrent
-- attendance insert performing its staff FK check.
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

  -- A processed month blocks approval only when an actual charged leave date,
  -- rather than an excluded Friday or known public holiday, falls in it.
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

  return v_request;
end;
$$;

revoke all on function public.review_leave_application(uuid, uuid, uuid, text, text) from public;
revoke all on function public.review_leave_application(uuid, uuid, uuid, text, text) from anon;
revoke all on function public.review_leave_application(uuid, uuid, uuid, text, text) from authenticated;
grant execute on function public.review_leave_application(uuid, uuid, uuid, text, text)
  to service_role;

-- Migration 048's holiday guard was intentionally conservative. Friday never
-- consumes leave, so toggling a Friday holiday cannot invalidate an approved
-- request. Replace the function with that exception while keeping all other
-- protection unchanged.
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
