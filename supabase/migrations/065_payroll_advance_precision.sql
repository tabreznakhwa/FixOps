-- ============================================================================
-- 065_payroll_advance_precision.sql
-- Staff advance balances can carry three-decimal KWD values after leave
-- settlements. Preserve that precision when payroll recovers the balance so a
-- value such as 250.146 is not rounded up to 250.150 and rejected as exceeding
-- the outstanding balance.
-- ============================================================================

begin;

alter table public.salary_slips
  alter column advance_deduction type numeric(13,3)
    using advance_deduction::numeric(13,3);

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
      3
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
       ) then
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

commit;
