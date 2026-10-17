-- Treat approved annual leave as unpaid while preserving every payroll snapshot
-- that already exists. Existing-run attendance remains grandfathered as paid
-- `leave`; only dates with no salary run are converted to `unpaid_leave`.

-- Attendance keeps paid compensation leave and legacy paid annual leave as
-- `leave`, paid sick leave as `sick_leave`, and uses `unpaid_leave` only for
-- approved annual leave that is not frozen by the migration-time snapshot.
alter table public.attendance
  add column if not exists annual_leave_paid_snapshot boolean default false;

-- A resumed draft may already have created the column without its final metadata.
-- Normalize that partial state before the snapshot CHECK/backfill use it.
update public.attendance
set annual_leave_paid_snapshot = false
where annual_leave_paid_snapshot is null;

alter table public.attendance
  alter column annual_leave_paid_snapshot set default false,
  alter column annual_leave_paid_snapshot set not null;

alter table public.attendance
  drop constraint if exists attendance_status_check;

alter table public.attendance
  add constraint attendance_status_check
  check (status in (
    'present',
    'absent',
    'half_day',
    'leave',
    'sick_leave',
    'unpaid_leave'
  ));

alter table public.attendance
  drop constraint if exists attendance_annual_leave_snapshot_check,
  add constraint attendance_annual_leave_snapshot_check
    check (
      not annual_leave_paid_snapshot
      or (status = 'leave' and leave_application_id is not null)
    );

-- Freeze annual-leave payroll inputs on every payslip. Historical slips are
-- deliberately grandfathered at zero so no processed or paid total changes.
alter table public.salary_slips
  add column if not exists annual_leave_days numeric(6, 2) default 0,
  add column if not exists annual_leave_deduction numeric(13, 3) default 0;

update public.salary_slips
set annual_leave_days = coalesce(annual_leave_days, 0),
    annual_leave_deduction = coalesce(annual_leave_deduction, 0)
where annual_leave_days is null
   or annual_leave_deduction is null;

-- Aggregate deduction/net fields must preserve the same three-decimal KWD
-- precision as the new annual-leave component. Existing two-decimal snapshots
-- retain their exact values while future runs can store fils without truncation.
alter table public.salary_slips
  alter column annual_leave_deduction type numeric(13,3)
    using annual_leave_deduction::numeric(13,3),
  alter column deductions type numeric(13,3) using deductions::numeric(13,3),
  alter column net_salary type numeric(13,3) using net_salary::numeric(13,3);

alter table public.salary_runs
  alter column total_deductions type numeric(13,3) using total_deductions::numeric(13,3),
  alter column total_net type numeric(13,3) using total_net::numeric(13,3);

alter table public.salary_slips
  alter column annual_leave_days set default 0,
  alter column annual_leave_days set not null,
  alter column annual_leave_deduction set default 0,
  alter column annual_leave_deduction set not null,
  drop constraint if exists salary_slips_annual_leave_days_check,
  drop constraint if exists salary_slips_annual_leave_deduction_check,
  drop constraint if exists salary_slips_annual_leave_pair_check,
  add constraint salary_slips_annual_leave_days_check
    check (
      annual_leave_days <> 'NaN'::numeric
      and annual_leave_days between 0 and 31
    ),
  add constraint salary_slips_annual_leave_deduction_check
    check (
      annual_leave_deduction <> 'NaN'::numeric
      and annual_leave_deduction >= 0
    ),
  add constraint salary_slips_annual_leave_pair_check
    check (annual_leave_days > 0 or annual_leave_deduction = 0);

-- The deferred validator accepts exactly two annual-leave snapshots:
--   * unpaid_leave for all newly approved or safely converted dates;
--   * legacy paid leave only while that date belongs to an existing salary run.
-- Managed rows remain immutable outside the approved transactional workflows.
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
     or extract(isodow from new.date) = 5
     or exists (
       select 1
       from public.attendance holiday
       where holiday.organization_id = new.organization_id
         and holiday.date = new.date
         and holiday.is_public_holiday
         and holiday.id <> new.id
     ) then
    raise exception 'Managed attendance date is not an approved leave working day';
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

revoke all on function public.validate_managed_leave_attendance() from public;

-- Freeze both tables while deciding which historical dates are unprocessed.
-- The explicit snapshot marker pins only the rows grandfathered by this migration;
-- future validator decisions never depend on mutable salary-run existence.
do $$
declare
  v_previous_bypass text := coalesce(
    current_setting('fixops.allow_leave_attendance_write', true),
    ''
  );
begin
  lock table public.salary_runs in share row exclusive mode;
  lock table public.attendance in share row exclusive mode;

  perform set_config('fixops.allow_leave_attendance_write', 'true', true);

  update public.attendance attendance_row
  set status = 'unpaid_leave',
      annual_leave_paid_snapshot = false
  from public.leave_applications application
  where application.id = attendance_row.leave_application_id
    and application.organization_id = attendance_row.organization_id
    and application.staff_id = attendance_row.staff_id
    and application.status = 'approved'
    and application.leave_type = 'annual_leave'
    and attendance_row.status = 'leave'
    and not exists (
      select 1
      from public.salary_runs run
      join public.salary_slips slip
        on slip.salary_run_id = run.id
       and slip.organization_id = run.organization_id
       and slip.staff_id = attendance_row.staff_id
      where run.organization_id = attendance_row.organization_id
        and run.salary_year = extract(year from attendance_row.date)::integer
        and run.salary_month = extract(month from attendance_row.date)::integer
    );

  update public.attendance attendance_row
  set annual_leave_paid_snapshot = true
  from public.leave_applications application
  where application.id = attendance_row.leave_application_id
    and application.organization_id = attendance_row.organization_id
    and application.staff_id = attendance_row.staff_id
    and application.status = 'approved'
    and application.leave_type = 'annual_leave'
    and attendance_row.status = 'leave'
    and not attendance_row.annual_leave_paid_snapshot
    and exists (
      select 1
      from public.salary_runs run
      join public.salary_slips slip
        on slip.salary_run_id = run.id
       and slip.organization_id = run.organization_id
       and slip.staff_id = attendance_row.staff_id
      where run.organization_id = attendance_row.organization_id
        and run.salary_year = extract(year from attendance_row.date)::integer
        and run.salary_month = extract(month from attendance_row.date)::integer
    );

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
$$;

-- Latest review behavior is based on migration 050: organization/month advisory
-- locks, attendance-before-staff locking, processed-month protection, pristine
-- auto-absence conversion, idempotent review, and service-role-only execution.
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
  where extract(isodow from day) <> 5
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

    -- The bypass must still be on for this update too: guard_approved_leave_application
    -- blocks a pending->approved status change unless it reads as on, and restoring the
    -- flag beforehand (as an earlier revision of this function did) left that update
    -- blocked by the same trigger it had just been granted write access around.
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

revoke all on function public.review_leave_application(uuid, uuid, uuid, text, text) from public;
revoke all on function public.review_leave_application(uuid, uuid, uuid, text, text) from anon;
revoke all on function public.review_leave_application(uuid, uuid, uuid, text, text) from authenticated;
grant execute on function public.review_leave_application(uuid, uuid, uuid, text, text)
  to service_role;

-- Latest payroll behavior is based on migration 051. Annual leave is counted and
-- deducted separately from ordinary absence. Its full fixed daily base includes
-- basic, all fixed allowances, food, and applicable seasonal fixed overtime.
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
  v_annual_leave_days numeric;
  v_annual_leave_deduction numeric;
  v_total_allowance numeric;
  v_total_ot numeric;
  v_gross numeric;
  v_non_advance_deductions numeric;
  v_net numeric;
  v_expected_days integer;
  v_recorded_days integer;
  v_rows integer;
  v_previous_payroll_write_mode text;
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
    select 1
    from public.users
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
    select 1
    from public.salary_runs
    where organization_id = p_org_id
      and salary_month = p_month
      and salary_year = p_year
  ) then
    raise exception 'Payroll already processed for this month';
  end if;

  if exists (
    select 1
    from public.leave_applications request
    cross join lateral generate_series(
      greatest(request.start_date, v_start_date),
      least(request.end_date, v_end_date),
      interval '1 day'
    ) as requested_day
    where request.organization_id = p_org_id
      and request.status = 'pending'
      and request.start_date <= v_end_date
      and request.end_date >= v_start_date
      and extract(isodow from requested_day) <> 5
      and not exists (
        select 1
        from public.attendance holiday
        where holiday.organization_id = p_org_id
          and holiday.date = requested_day::date
          and holiday.is_public_holiday
      )
  ) then
    raise exception 'Cannot process payroll while pending leave applications overlap this month';
  end if;

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
      or (entry->>'food_deduction')::numeric = 'NaN'::numeric
      or (entry->>'advance_deduction')::numeric = 'NaN'::numeric
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

  for v_staff in
    select *
    from public.staff
    where organization_id = p_org_id
      and id = any(v_staff_ids)
    order by id
  loop
    select count(*)::integer
    into v_expected_days
    from generate_series(
      greatest(v_start_date, v_staff.joining_date),
      v_end_date,
      interval '1 day'
    ) as work_day
    where extract(isodow from work_day) <> 5
      and not exists (
        select 1
        from public.attendance holiday
        where holiday.organization_id = p_org_id
          and holiday.date = work_day::date
          and holiday.is_public_holiday
      );

    select count(distinct attendance_row.date)::integer
    into v_recorded_days
    from public.attendance attendance_row
    where attendance_row.organization_id = p_org_id
      and attendance_row.staff_id = v_staff.id
      and attendance_row.date between greatest(v_start_date, v_staff.joining_date) and v_end_date
      and extract(isodow from attendance_row.date) <> 5
      and not attendance_row.is_public_holiday;

    if v_recorded_days <> v_expected_days then
      raise exception 'Cannot process payroll because attendance is incomplete for % (% of % working days recorded)',
        v_staff.full_name, v_recorded_days, v_expected_days;
    end if;
  end loop;

  v_previous_payroll_write_mode := coalesce(
    current_setting('fixops.payroll_write_mode', true),
    ''
  );
  perform set_config('fixops.payroll_write_mode', 'process', true);

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
          when attendance_row.status = 'unpaid_leave'
           and exists (
             select 1
             from public.leave_applications application
             where application.id = attendance_row.leave_application_id
               and application.organization_id = attendance_row.organization_id
               and application.staff_id = attendance_row.staff_id
               and application.status = 'approved'
               and application.leave_type = 'annual_leave'
           )
          then 1
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
    into v_absent_days, v_annual_leave_days, v_normal_ot, v_friday_ot
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
    v_annual_leave_deduction := round(case
      when v_annual_leave_days > 0
      then ((v_basic + v_allowance + v_food + v_fixed_ot) / 30)
        * v_annual_leave_days
      else 0
    end, 3);
    v_total_allowance := round(v_allowance + v_food, 2);
    v_total_ot := round(v_fixed_ot + v_normal_ot + v_friday_ot, 2);
    v_gross := round(v_basic + v_total_allowance + v_total_ot, 2);
    v_non_advance_deductions := round(
      v_absent_deduction + v_annual_leave_deduction + v_food_deduction,
      3
    );
    v_net := round(
      v_gross - v_advance_deduction - v_non_advance_deductions,
      3
    );
    if v_net < 0 then
      raise exception 'Deductions exceed gross salary for %', v_staff.full_name;
    end if;

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
      annual_leave_days,
      annual_leave_deduction,
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
      coalesce(v_staff.housing_allowance, 0),
      coalesce(v_staff.transport_allowance, 0),
      v_food,
      coalesce(v_staff.other_allowance, 0),
      coalesce(to_jsonb(v_staff)->>'allowance_name', 'Allowance'),
      v_fixed_ot,
      v_normal_ot,
      v_friday_ot,
      v_gross,
      v_absent_days,
      v_absent_deduction,
      v_annual_leave_days,
      v_annual_leave_deduction,
      v_food_deduction,
      v_non_advance_deductions,
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
      + v_advance_deduction + v_non_advance_deductions;
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

  perform set_config(
    'fixops.payroll_write_mode',
    v_previous_payroll_write_mode,
    true
  );

  return v_run_id;
end;
$$;

revoke all on function public.process_payroll(uuid, uuid, integer, integer, jsonb) from public;
revoke all on function public.process_payroll(uuid, uuid, integer, integer, jsonb) from anon;
revoke all on function public.process_payroll(uuid, uuid, integer, integer, jsonb) from authenticated;
grant execute on function public.process_payroll(uuid, uuid, integer, integer, jsonb)
  to service_role;

-- Reset keeps migration 051's paid-child guard and balance restoration. Before a
-- resettable run is removed, legacy annual-leave rows in its month are converted
-- under the same transaction and lock order so re-processing applies the new rule.
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
  v_start_date date;
  v_end_date date;
  v_previous_bypass text;
  v_previous_payroll_write_mode text;
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

  v_start_date := make_date(v_run.salary_year, v_run.salary_month, 1);
  v_end_date := (v_start_date + interval '1 month - 1 day')::date;

  perform public.lock_leave_payroll_months(
    p_org_id,
    v_start_date,
    v_start_date
  );

  select * into v_run
  from public.salary_runs
  where id = p_run_id
    and organization_id = p_org_id
  for update;

  if not found then
    raise exception 'Payroll run not found';
  end if;
  if v_run.status = 'paid' or exists (
    select 1
    from public.salary_slips
    where organization_id = p_org_id
      and salary_run_id = p_run_id
      and payment_status = 'paid'
  ) then
    raise exception 'Cannot reset a payroll run that has already been paid out';
  end if;

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

  v_previous_bypass := coalesce(
    current_setting('fixops.allow_leave_attendance_write', true),
    ''
  );

  begin
    perform set_config('fixops.allow_leave_attendance_write', 'true', true);

    update public.attendance attendance_row
    set status = 'unpaid_leave',
        annual_leave_paid_snapshot = false
    from public.leave_applications application
    where application.id = attendance_row.leave_application_id
      and application.organization_id = attendance_row.organization_id
      and application.staff_id = attendance_row.staff_id
      and application.status = 'approved'
      and application.leave_type = 'annual_leave'
      and attendance_row.organization_id = p_org_id
      and attendance_row.date between v_start_date and v_end_date
      and attendance_row.status = 'leave'
      and attendance_row.annual_leave_paid_snapshot
      and exists (
        select 1
        from public.salary_slips slip
        where slip.organization_id = p_org_id
          and slip.salary_run_id = p_run_id
          and slip.staff_id = attendance_row.staff_id
      );

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

  v_previous_payroll_write_mode := coalesce(
    current_setting('fixops.payroll_write_mode', true),
    ''
  );
  perform set_config('fixops.payroll_write_mode', 'reset', true);

  delete from public.salary_slips
  where salary_run_id = p_run_id
    and organization_id = p_org_id;

  delete from public.salary_runs
  where id = p_run_id
    and organization_id = p_org_id;

  perform set_config(
    'fixops.payroll_write_mode',
    v_previous_payroll_write_mode,
    true
  );
end;
$$;

revoke all on function public.reset_payroll_run(uuid, uuid, uuid) from public;
revoke all on function public.reset_payroll_run(uuid, uuid, uuid) from anon;
revoke all on function public.reset_payroll_run(uuid, uuid, uuid) from authenticated;
grant execute on function public.reset_payroll_run(uuid, uuid, uuid)
  to service_role;

-- Payroll rows are financial snapshots. Browser roles already have read-only
-- grants, and application writes go through SECURITY DEFINER RPCs. These guards
-- also prevent an accidental service-role table write from rewriting history.
-- Process/reset set a transaction-local mode for the writes they legitimately
-- own; salary payment is accepted only as its exact pending-to-paid transition.
create or replace function public.guard_payroll_snapshot_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_mode text := coalesce(current_setting('fixops.payroll_write_mode', true), '');
begin
  if tg_table_name = 'salary_slips' then
    if tg_op = 'INSERT' then
      if v_mode <> 'process' then
        raise exception 'Salary slips can only be created by payroll processing';
      end if;
      return new;
    elsif tg_op = 'DELETE' then
      if v_mode <> 'reset' then
        raise exception 'Salary slips can only be deleted by payroll reset';
      end if;
      return old;
    end if;

    if old.payment_status = 'pending'
       and new.payment_status = 'paid'
       and new.payment_mode is not null
       and new.payment_date is not null
       and (to_jsonb(new) - array[
         'payment_status', 'payment_mode', 'payment_date'
       ]::text[]) = (to_jsonb(old) - array[
         'payment_status', 'payment_mode', 'payment_date'
       ]::text[]) then
      return new;
    end if;

    raise exception 'Salary slip snapshots cannot be changed';
  end if;

  if tg_op = 'INSERT' then
    if v_mode <> 'process' then
      raise exception 'Salary runs can only be created by payroll processing';
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if v_mode <> 'reset' then
      raise exception 'Salary runs can only be deleted by payroll reset';
    end if;
    return old;
  end if;

  if v_mode = 'process'
     and old.status = 'draft'
     and new.status = 'draft'
     and (to_jsonb(new) - array[
       'total_basic', 'total_allowances', 'total_overtime',
       'total_deductions', 'total_net'
     ]::text[]) = (to_jsonb(old) - array[
       'total_basic', 'total_allowances', 'total_overtime',
       'total_deductions', 'total_net'
     ]::text[]) then
    return new;
  end if;

  if old.status <> 'paid'
     and new.status = 'paid'
     and new.approved_by is not null
     and new.approved_at is not null
     and (to_jsonb(new) - array[
       'status', 'approved_by', 'approved_at'
     ]::text[]) = (to_jsonb(old) - array[
       'status', 'approved_by', 'approved_at'
     ]::text[]) then
    return new;
  end if;

  raise exception 'Salary run snapshots cannot be changed';
end;
$$;

revoke all on function public.guard_payroll_snapshot_write() from public;

-- Install the guards only after this migration's one-time historical backfill.
drop trigger if exists salary_slips_guard_snapshot_write on public.salary_slips;
create trigger salary_slips_guard_snapshot_write
before insert or update or delete on public.salary_slips
for each row execute function public.guard_payroll_snapshot_write();

drop trigger if exists salary_runs_guard_snapshot_write on public.salary_runs;
create trigger salary_runs_guard_snapshot_write
before insert or update or delete on public.salary_runs
for each row execute function public.guard_payroll_snapshot_write();

-- SECURITY DEFINER RPCs retain owner privileges; direct API-role writes do not.
revoke insert, update, delete
  on public.salary_runs, public.salary_slips
  from public, anon, authenticated, service_role;
