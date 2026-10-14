-- Finish the consistency guarantees required by migration 050. Production had
-- lost the attendance uniqueness declared by migration 008, and salary slips
-- never had an equivalent one-per-employee/run invariant. Fail with a clear
-- message rather than leaving a partially applied migration if legacy duplicates
-- have appeared since the preflight check.
do $$
begin
  if exists (
    select 1
    from public.attendance
    group by organization_id, staff_id, date
    having count(*) > 1
  ) then
    raise exception 'Duplicate attendance rows block migration 051';
  end if;

  if exists (
    select 1
    from public.salary_slips
    group by salary_run_id, staff_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate salary slips block migration 051';
  end if;
end
$$;

create unique index if not exists attendance_org_staff_date_uidx
  on public.attendance(organization_id, staff_id, date);

create unique index if not exists salary_slips_run_staff_uidx
  on public.salary_slips(salary_run_id, staff_id);

-- Migration 050 included housing and transport when calculating gross pay, but
-- stored only the legacy `other_allowance` value on each slip. Replace the RPC
-- so its immutable payslip breakdown reconciles with gross and net totals.
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
  v_expected_days integer;
  v_recorded_days integer;
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

-- Legacy runs can contain paid slips while the parent run still has a pre-051
-- status. Refuse reset if either the run or any child slip records payment.
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

create or replace function public.pay_salary_run(
  p_org_id uuid,
  p_paid_by uuid,
  p_run_id uuid,
  p_payment_date date,
  p_entries jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.salary_runs%rowtype;
  v_expected_count integer;
  v_entry_count integer;
  v_entry_ids integer;
begin
  if p_org_id is null or p_paid_by is null or p_run_id is null then
    raise exception 'Forbidden';
  end if;
  if p_payment_date is null then
    raise exception 'Payment date is required';
  end if;
  if jsonb_typeof(p_entries) is distinct from 'array'
     or jsonb_array_length(p_entries) = 0 then
    raise exception 'No entries provided';
  end if;
  if not exists (
    select 1
    from public.users
    where id = p_paid_by
      and organization_id = p_org_id
      and status = 'active'
      and role in ('owner', 'admin', 'manager', 'accounts')
  ) then
    raise exception 'Forbidden';
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

  select * into v_run
  from public.salary_runs
  where id = p_run_id
    and organization_id = p_org_id
  for update;

  if not found then
    raise exception 'Payroll run not found';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_entries) as entry
    where jsonb_typeof(entry) <> 'object'
      or coalesce(entry->>'slip_id', '')
        !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      or coalesce(entry->>'payment_mode', '') not in (
        'cash',
        'bank_transfer',
        'cheque'
      )
  ) then
    raise exception 'Invalid salary payment entry';
  end if;

  select count(*)::integer, count(distinct entry->>'slip_id')::integer
  into v_entry_count, v_entry_ids
  from jsonb_array_elements(p_entries) as entry;

  select count(*)::integer into v_expected_count
  from public.salary_slips
  where organization_id = p_org_id
    and salary_run_id = p_run_id
    and payment_status = 'pending';

  if v_expected_count = 0 then
    if v_run.status = 'paid' then
      return;
    end if;
    raise exception 'This payroll run has no pending salary slips';
  end if;

  if v_entry_count <> v_expected_count or v_entry_ids <> v_expected_count then
    raise exception 'Salary payment entries are incomplete or duplicated';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_entries) as entry
    left join public.salary_slips slip
      on slip.id = (entry->>'slip_id')::uuid
     and slip.organization_id = p_org_id
     and slip.salary_run_id = p_run_id
     and slip.payment_status = 'pending'
    where slip.id is null
  ) then
    raise exception 'A salary payment entry does not belong to this pending payroll run';
  end if;

  update public.salary_slips slip
  set payment_status = 'paid',
      payment_mode = (entry.value->>'payment_mode')::public.payment_mode,
      payment_date = p_payment_date
  from jsonb_array_elements(p_entries) as entry(value)
  where slip.id = (entry.value->>'slip_id')::uuid
    and slip.organization_id = p_org_id
    and slip.salary_run_id = p_run_id
    and slip.payment_status = 'pending';

  if not found then
    raise exception 'No salary payments were updated';
  end if;

  if exists (
    select 1
    from public.salary_slips
    where organization_id = p_org_id
      and salary_run_id = p_run_id
      and payment_status <> 'paid'
  ) then
    raise exception 'Salary payment entries did not cover every payslip';
  end if;

  update public.salary_runs
  set status = 'paid',
      approved_by = p_paid_by,
      approved_at = now()
  where id = p_run_id
    and organization_id = p_org_id;
end;
$$;

revoke all on function public.pay_salary_run(uuid, uuid, uuid, date, jsonb) from public;
revoke all on function public.pay_salary_run(uuid, uuid, uuid, date, jsonb) from anon;
revoke all on function public.pay_salary_run(uuid, uuid, uuid, date, jsonb) from authenticated;
grant execute on function public.pay_salary_run(uuid, uuid, uuid, date, jsonb)
  to service_role;

-- Leave settlement pays part of the current month as a recoverable advance. Keep
-- the payroll-run check, month lock, staff balance and ledger insert in one
-- transaction so settlement cannot race monthly payroll or other advances.
create or replace function public.settle_leave_salary(
  p_org_id uuid,
  p_paid_by uuid,
  p_staff_id uuid,
  p_settlement_date date,
  p_amount numeric,
  p_expected_balance numeric,
  p_payment_method text default 'cash',
  p_notes text default null
)
returns table(advance_id uuid, balance_after numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.staff%rowtype;
  v_year integer;
  v_month integer;
  v_before numeric;
  v_advance_id uuid;
begin
  if p_org_id is null or p_paid_by is null or p_staff_id is null
     or p_settlement_date is null or p_amount is null or p_amount <= 0
     or p_expected_balance is null or p_expected_balance < 0 then
    raise exception 'Invalid leave settlement';
  end if;
  if p_payment_method is null
     or p_payment_method not in ('cash', 'bank_transfer', 'cheque') then
    raise exception 'Select a valid payment method';
  end if;
  if p_notes is not null and char_length(p_notes) > 1000 then
    raise exception 'Notes cannot exceed 1,000 characters';
  end if;
  if not exists (
    select 1
    from public.users
    where id = p_paid_by
      and organization_id = p_org_id
      and status = 'active'
      and role in ('owner', 'admin', 'manager')
  ) then
    raise exception 'Forbidden';
  end if;

  v_year := extract(year from p_settlement_date)::integer;
  v_month := extract(month from p_settlement_date)::integer;
  perform public.lock_leave_payroll_months(
    p_org_id,
    date_trunc('month', p_settlement_date)::date,
    p_settlement_date
  );

  if exists (
    select 1
    from public.salary_runs
    where organization_id = p_org_id
      and salary_month = v_month
      and salary_year = v_year
  ) then
    raise exception 'Payroll for this month has already been processed. Settle from that run instead.';
  end if;

  select * into v_staff
  from public.staff
  where id = p_staff_id
    and organization_id = p_org_id
    and employment_status = 'active'
  for update;

  if not found then
    raise exception 'Employee not found';
  end if;

  v_before := coalesce(v_staff.advance_balance, 0);
  if abs(v_before - p_expected_balance) > 0.001 then
    raise exception 'The employee advance balance changed. Recalculate the settlement and try again.';
  end if;

  update public.staff
  set advance_balance = v_before + round(p_amount, 2)
  where id = p_staff_id
    and organization_id = p_org_id;

  insert into public.staff_advances (
    organization_id,
    staff_id,
    type,
    amount,
    issued_date,
    payment_method,
    notes,
    created_by
  ) values (
    p_org_id,
    p_staff_id,
    'advance',
    round(p_amount, 2),
    p_settlement_date,
    p_payment_method,
    p_notes,
    p_paid_by
  ) returning id into v_advance_id;

  return query select
    v_advance_id,
    v_before + round(p_amount, 2);
end;
$$;

revoke all on function public.settle_leave_salary(uuid, uuid, uuid, date, numeric, numeric, text, text) from public;
revoke all on function public.settle_leave_salary(uuid, uuid, uuid, date, numeric, numeric, text, text) from anon;
revoke all on function public.settle_leave_salary(uuid, uuid, uuid, date, numeric, numeric, text, text) from authenticated;
grant execute on function public.settle_leave_salary(uuid, uuid, uuid, date, numeric, numeric, text, text)
  to service_role;

-- Staff profile edits may change opening advance/loan figures while advance
-- issue, repayment, leave settlement or payroll is touching the same balance.
-- Apply that delta under the same staff-row lock instead of letting the API
-- overwrite a newer balance from an earlier read.
create or replace function public.update_staff_profile_with_opening_balance(
  p_org_id uuid,
  p_updated_by uuid,
  p_staff_id uuid,
  p_expected_opening_advance numeric,
  p_expected_opening_loan numeric,
  p_updates jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.staff%rowtype;
  v_opening_advance numeric;
  v_opening_loan numeric;
  v_balance numeric;
begin
  if p_org_id is null or p_updated_by is null or p_staff_id is null
     or p_expected_opening_advance is null or p_expected_opening_loan is null
     or jsonb_typeof(p_updates) is distinct from 'object' then
    raise exception 'Invalid staff update';
  end if;
  if not exists (
    select 1
    from public.users
    where id = p_updated_by
      and organization_id = p_org_id
      and status = 'active'
      and role in ('owner', 'admin', 'hr', 'manager')
  ) then
    raise exception 'Forbidden';
  end if;

  select * into v_staff
  from public.staff
  where id = p_staff_id
    and organization_id = p_org_id
  for update;

  if not found then
    raise exception 'Employee not found';
  end if;
  if abs(coalesce(v_staff.opening_advance, 0) - p_expected_opening_advance) > 0.001
     or abs(coalesce(v_staff.opening_loan, 0) - p_expected_opening_loan) > 0.001 then
    raise exception 'The employee opening balance changed. Reload and try again.';
  end if;

  v_opening_advance := coalesce((p_updates->>'opening_advance')::numeric, 0);
  v_opening_loan := coalesce((p_updates->>'opening_loan')::numeric, 0);
  if v_opening_advance < 0 or v_opening_loan < 0 then
    raise exception 'Opening advance and loan cannot be negative';
  end if;
  v_balance := greatest(
    0,
    coalesce(v_staff.advance_balance, 0)
      + v_opening_advance - coalesce(v_staff.opening_advance, 0)
      + v_opening_loan - coalesce(v_staff.opening_loan, 0)
  );

  update public.staff
  set full_name = p_updates->>'full_name',
      designation = nullif(p_updates->>'designation', ''),
      department = nullif(p_updates->>'department', ''),
      mobile_number = nullif(p_updates->>'mobile_number', ''),
      email = nullif(p_updates->>'email', ''),
      nationality = nullif(p_updates->>'nationality', ''),
      passport_number = nullif(p_updates->>'passport_number', ''),
      visa_number = nullif(p_updates->>'visa_number', ''),
      emirates_id = nullif(p_updates->>'emirates_id', ''),
      visa_expiry_date = nullif(p_updates->>'visa_expiry_date', '')::date,
      passport_expiry_date = nullif(p_updates->>'passport_expiry_date', '')::date,
      basic_salary = coalesce((p_updates->>'basic_salary')::numeric, 0),
      housing_allowance = 0,
      transport_allowance = 0,
      food_allowance = coalesce((p_updates->>'food_allowance')::numeric, 0),
      other_allowance = coalesce((p_updates->>'other_allowance')::numeric, 0),
      allowance_name = coalesce(nullif(btrim(p_updates->>'allowance_name'), ''), 'Allowance'),
      fixed_overtime_monthly = coalesce((p_updates->>'fixed_overtime_monthly')::numeric, 0),
      friday_ot_amount = coalesce((p_updates->>'friday_ot_amount')::numeric, 0),
      opening_advance = v_opening_advance,
      opening_loan = v_opening_loan,
      advance_balance = v_balance,
      overtime_eligible = coalesce((p_updates->>'overtime_eligible')::boolean, false),
      bank_name = nullif(p_updates->>'bank_name', ''),
      iban = nullif(p_updates->>'iban', ''),
      employment_status = p_updates->>'employment_status',
      notes = nullif(p_updates->>'notes', '')
  where id = p_staff_id
    and organization_id = p_org_id;
end;
$$;

revoke all on function public.update_staff_profile_with_opening_balance(uuid, uuid, uuid, numeric, numeric, jsonb) from public;
revoke all on function public.update_staff_profile_with_opening_balance(uuid, uuid, uuid, numeric, numeric, jsonb) from anon;
revoke all on function public.update_staff_profile_with_opening_balance(uuid, uuid, uuid, numeric, numeric, jsonb) from authenticated;
grant execute on function public.update_staff_profile_with_opening_balance(uuid, uuid, uuid, numeric, numeric, jsonb)
  to service_role;
