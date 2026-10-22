begin;

-- Owner/Admin leave-settlement recovery override.
--
-- Leave settlement pays part of the current month as a recoverable advance
-- (staff.advance_balance), which normally auto-recovers from the employee's
-- next payroll run. This migration lets an owner or admin choose how much of
-- the existing balance is netted from today's settlement payout. The resolved
-- recovery is persisted as explanatory metadata on the advance row; it never
-- becomes a separate ledger credit or changes the balance arithmetic itself.
--
-- staff.advance_balance and staff_advances.amount were created outside complete
-- tracked migration history, so their live precision/scale cannot be assumed
-- from any CREATE TABLE in this repo. Settlement payouts and
-- recovery overrides need at least 3 decimal places, so widen both columns
-- from an information_schema preflight rather than a hard-coded ALTER: this
-- is safe to run manually against whatever fixed-scale numeric type is
-- actually live, is a no-op if a column was already widened to >=3 decimals
-- (idempotent), and preserves each column's existing integer-digit capacity
-- (new precision = old precision - old scale + 3).
do $$
declare
  v_table text;
  v_column text;
  v_data_type text;
  v_precision integer;
  v_scale integer;
  v_new_precision integer;
  v_cols text[][] := array[
    array['staff', 'advance_balance'],
    array['staff_advances', 'amount']
  ];
  v_pair text[];
begin
  foreach v_pair slice 1 in array v_cols
  loop
    v_table := v_pair[1];
    v_column := v_pair[2];

    select data_type, numeric_precision, numeric_scale
      into v_data_type, v_precision, v_scale
    from information_schema.columns
    where table_schema = 'public'
      and table_name = v_table
      and column_name = v_column;

    if not found then
      raise exception 'Migration 062 preflight: public.%.% was not found', v_table, v_column;
    end if;

    if v_data_type <> 'numeric' then
      raise exception 'Migration 062 preflight: public.%.% is % (expected numeric)', v_table, v_column, v_data_type;
    end if;

    -- Unbounded numeric (no declared precision/scale) already accepts any
    -- number of decimal places; nothing to widen.
    if v_scale is null then
      continue;
    end if;

    if v_scale >= 3 then
      continue;
    end if;

    if v_precision is null then
      raise exception 'Migration 062 preflight: public.%.% has a scale but no precision', v_table, v_column;
    end if;

    v_new_precision := v_precision - v_scale + 3;

    execute format(
      'alter table public.%I alter column %I type numeric(%s,3) using %I::numeric(%s,3)',
      v_table, v_column, v_new_precision, v_column, v_new_precision
    );
  end loop;
end
$$;

-- Nullable recovery metadata + a default-false override marker on the
-- advance row the settlement inserts into. Additive and idempotent.
alter table public.staff_advances
  add column if not exists settlement_recovery_amount numeric(13, 3),
  add column if not exists settlement_recovery_overridden boolean not null default false;

-- Re-running an earlier draft may have created temporary names. Preserve any
-- metadata already written. The legacy columns are deliberately left in place
-- rather than dropped by this additive migration.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'staff_advances'
      and column_name = 'recovery_override_amount'
  ) then
    execute $sql$
      update public.staff_advances
      set settlement_recovery_amount = coalesce(
            settlement_recovery_amount,
            recovery_override_amount
          )
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'staff_advances'
      and column_name = 'recovery_override_applied'
  ) then
    execute $sql$
      update public.staff_advances
      set settlement_recovery_overridden = settlement_recovery_overridden
        or coalesce(recovery_override_applied, false)
    $sql$;
  end if;
end
$$;

-- Replace settle_leave_salary with a 9-arg signature. The old 8-arg
-- overload is dropped explicitly rather than left alongside the new one:
-- p_recovery_override is a required (non-defaulted) parameter so every
-- caller must pass it explicitly, even as null, and the function keeps a
-- single unambiguous signature rather than two overloads differing only in
-- a defaulted tail parameter. Dropping the 9-arg form too makes a rerun replace
-- its body cleanly even though its output-column definition is fixed by PostgreSQL.
drop function if exists public.settle_leave_salary(uuid, uuid, uuid, date, numeric, numeric, text, text);
drop function if exists public.settle_leave_salary(uuid, uuid, uuid, date, numeric, numeric, numeric, text, text);

create function public.settle_leave_salary(
  p_org_id uuid,
  p_paid_by uuid,
  p_staff_id uuid,
  p_settlement_date date,
  p_amount numeric,
  p_expected_balance numeric,
  p_recovery_override numeric,
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
  v_actor_role text;
  v_year integer;
  v_month integer;
  v_before numeric;
  v_resolved_recovery numeric;
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

  select role into v_actor_role
  from public.users
  where id = p_paid_by
    and organization_id = p_org_id
    and status = 'active';

  if not found or v_actor_role not in ('owner', 'admin', 'manager') then
    raise exception 'Forbidden';
  end if;

  if p_recovery_override is not null and v_actor_role not in ('owner', 'admin') then
    raise exception 'Only an owner or admin can change advance recovery';
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
  if abs(v_before - p_expected_balance) >= 0.001 then
    raise exception 'The employee advance balance changed. Recalculate the settlement and try again.';
  end if;

  -- From here on v_before is the locked advance balance: validate the
  -- override and the payout amount against it before writing anything.
  if p_amount::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'Settlement amount must be a finite number';
  end if;
  if round(p_amount, 3) <> p_amount then
    raise exception 'Settlement amount cannot have more than 3 decimal places';
  end if;

  if p_recovery_override is not null then
    if p_recovery_override::text in ('NaN', 'Infinity', '-Infinity') then
      raise exception 'Advance recovery must be a finite number';
    end if;
    if round(p_recovery_override, 3) <> p_recovery_override then
      raise exception 'Advance recovery cannot have more than 3 decimal places';
    end if;
    if p_recovery_override < 0 then
      raise exception 'Advance recovery cannot be negative';
    end if;
    if p_recovery_override > v_before then
      raise exception 'Advance recovery cannot exceed the existing advance balance';
    end if;
  end if;

  v_resolved_recovery := coalesce(p_recovery_override, v_before);

  update public.staff
  set advance_balance = v_before + round(p_amount, 3)
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
    created_by,
    settlement_recovery_amount,
    settlement_recovery_overridden
  ) values (
    p_org_id,
    p_staff_id,
    'advance',
    round(p_amount, 3),
    p_settlement_date,
    p_payment_method,
    p_notes,
    p_paid_by,
    round(v_resolved_recovery, 3),
    p_recovery_override is not null
  ) returning id into v_advance_id;

  return query select
    v_advance_id,
    v_before + round(p_amount, 3);
end;
$$;

revoke all on function public.settle_leave_salary(uuid, uuid, uuid, date, numeric, numeric, numeric, text, text) from public;
revoke all on function public.settle_leave_salary(uuid, uuid, uuid, date, numeric, numeric, numeric, text, text) from anon;
revoke all on function public.settle_leave_salary(uuid, uuid, uuid, date, numeric, numeric, numeric, text, text) from authenticated;
grant execute on function public.settle_leave_salary(uuid, uuid, uuid, date, numeric, numeric, numeric, text, text)
  to service_role;

commit;
