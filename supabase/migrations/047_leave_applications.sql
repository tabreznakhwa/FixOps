-- Employee leave applications with atomic admin approval into attendance.
--
-- Annual and compensation leave both materialize as attendance.status = 'leave';
-- sick leave materializes as 'sick_leave' so the existing 15-day usage warning
-- remains accurate. Fridays are the weekly off and do not consume leave days.
create extension if not exists btree_gist;

create table leave_applications (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  staff_id         uuid not null references staff(id) on delete cascade,
  leave_type       text not null check (leave_type in ('annual_leave', 'sick_leave', 'compensation_leave')),
  start_date       date not null,
  end_date         date not null,
  requested_days   integer not null check (requested_days > 0),
  reason           text not null,
  status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  idempotency_key  text,
  active_period    daterange generated always as (
    case when status in ('pending', 'approved') then daterange(start_date, end_date, '[]') else null end
  ) stored,
  submitted_by     uuid not null references users(id),
  reviewed_by      uuid references users(id),
  reviewed_at      timestamptz,
  review_note      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (end_date >= start_date),
  unique (organization_id, staff_id, idempotency_key),
  exclude using gist (
    organization_id with =,
    staff_id with =,
    active_period with &&
  ) where (active_period is not null)
);

create index idx_leave_applications_org_status_created
  on leave_applications(organization_id, status, created_at desc);
create index idx_leave_applications_org_staff_dates
  on leave_applications(organization_id, staff_id, start_date, end_date);

alter table attendance
  add column leave_application_id uuid references leave_applications(id) on delete set null;
create unique index idx_attendance_leave_application_date
  on attendance(leave_application_id, date)
  where leave_application_id is not null;

alter table leave_applications enable row level security;

create policy "leave_applications_select_own_or_reviewer" on leave_applications
  for select using (
    is_user_active()
    and get_user_role() <> 'attendance_kiosk'
    and organization_id = get_user_organization_id()
    and (
      staff_id in (
        select id from staff
        where user_id = auth.uid()
          and organization_id = get_user_organization_id()
          and employment_status = 'active'
      )
      or get_user_role() in ('owner', 'admin')
    )
  );

-- Direct client inserts/updates are intentionally not granted. Supabase default
-- privileges may grant broader rights on new tables, so reset both API roles
-- explicitly before restoring authenticated read access. Employee submissions
-- and cancellations go through validated APIs; reviews use the definer function.
revoke all on leave_applications from anon;
revoke all on leave_applications from authenticated;
grant select on leave_applications to authenticated;
grant select, insert, update, delete on leave_applications to service_role;

-- Return the currently known leave-day count. Public holidays are represented
-- by any attendance row for that organization with is_public_holiday = true.
create or replace function count_leave_working_days(
  p_org_id uuid,
  p_start_date date,
  p_end_date date
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from generate_series(p_start_date, p_end_date, interval '1 day') as day
  where extract(isodow from day) <> 5
    and not exists (
      select 1 from attendance holiday
      where holiday.organization_id = p_org_id
        and holiday.date = day::date
        and holiday.is_public_holiday = true
    );
$$;

revoke all on function count_leave_working_days(uuid, date, date) from public;
revoke all on function count_leave_working_days(uuid, date, date) from anon;
revoke all on function count_leave_working_days(uuid, date, date) from authenticated;
grant execute on function count_leave_working_days(uuid, date, date) to service_role;

-- Atomically approve/reject a request. Approval creates one paid attendance row
-- per working day. A pristine absence created by the nightly or manual
-- auto-absence action may be safely replaced; worked, manually-entered, or
-- other leave rows are conflicts.
create or replace function review_leave_application(
  p_application_id uuid,
  p_org_id uuid,
  p_reviewer_id uuid,
  p_decision text,
  p_review_note text default null
)
returns leave_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request leave_applications%rowtype;
  v_staff_status text;
  v_date date;
  v_status text;
  v_conflicts text[] := array[]::text[];
  v_existing attendance%rowtype;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;

  -- The app calls this only with the service-role client. If it is ever granted
  -- to authenticated directly, bind p_reviewer_id to auth.uid() here as well.
  if not exists (
    select 1 from users
    where id = p_reviewer_id
      and organization_id = p_org_id
      and status = 'active'
      and role in ('owner', 'admin')
  ) then
    raise exception 'Only an owner or admin can review leave applications';
  end if;

  select * into v_request
  from leave_applications
  where id = p_application_id and organization_id = p_org_id
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

  select employment_status into v_staff_status
  from staff
  where id = v_request.staff_id
    and organization_id = p_org_id
  for update;

  if not found or v_staff_status <> 'active' then
    raise exception 'Leave can only be approved or rejected for an active employee';
  end if;

  if p_decision = 'rejected' then
    update leave_applications set
      status = 'rejected',
      reviewed_by = p_reviewer_id,
      reviewed_at = now(),
      review_note = nullif(btrim(p_review_note), ''),
      updated_at = now()
    where id = v_request.id
    returning * into v_request;
    return v_request;
  end if;

  if exists (
    select 1 from salary_runs
    where organization_id = p_org_id
      and daterange(
        make_date(salary_year, salary_month, 1),
        (make_date(salary_year, salary_month, 1) + interval '1 month - 1 day')::date,
        '[]'
      ) && daterange(v_request.start_date, v_request.end_date, '[]')
  ) then
    raise exception 'Payroll has already been processed for part of this leave period';
  end if;

  v_status := case when v_request.leave_type = 'sick_leave' then 'sick_leave' else 'leave' end;
  v_request.requested_days := count_leave_working_days(
    p_org_id,
    v_request.start_date,
    v_request.end_date
  );

  if v_request.requested_days < 1 then
    raise exception 'The selected range contains no working days';
  end if;

  -- Recalculate at review time because a public holiday may have been marked
  -- after the employee submitted the application.
  update leave_applications
  set requested_days = v_request.requested_days,
      updated_at = now()
  where id = v_request.id;

  -- Check every non-Friday date before writing anything, so approval is all-or-nothing.
  for v_date in
    select day::date
    from generate_series(v_request.start_date, v_request.end_date, interval '1 day') as day
    where extract(isodow from day) <> 5
      and not exists (
        select 1 from attendance holiday
        where holiday.organization_id = p_org_id
          and holiday.date = day::date
          and holiday.is_public_holiday = true
      )
  loop
    select * into v_existing
    from attendance
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

  for v_date in
    select day::date
    from generate_series(v_request.start_date, v_request.end_date, interval '1 day') as day
    where extract(isodow from day) <> 5
      and not exists (
        select 1 from attendance holiday
        where holiday.organization_id = p_org_id
          and holiday.date = day::date
          and holiday.is_public_holiday = true
      )
  loop
    insert into attendance (
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
      select 1 from attendance
      where organization_id = p_org_id
        and staff_id = v_request.staff_id
        and date = v_date
        and leave_application_id = v_request.id
    ) then
      update attendance set
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

  update leave_applications set
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

revoke all on function review_leave_application(uuid, uuid, uuid, text, text) from public;
revoke all on function review_leave_application(uuid, uuid, uuid, text, text) from anon;
revoke all on function review_leave_application(uuid, uuid, uuid, text, text) from authenticated;
grant execute on function review_leave_application(uuid, uuid, uuid, text, text) to service_role;
