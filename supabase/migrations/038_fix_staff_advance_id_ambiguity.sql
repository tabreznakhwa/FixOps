-- record_staff_advance_repayment (and record_staff_advance_issue, same bug)
-- declares `returns table(id uuid, balance_before numeric, balance_after
-- numeric)`. In PL/pgSQL, RETURNS TABLE columns become variables in the
-- function's own namespace — so the unqualified `where id = p_staff_id`
-- against `staff` was ambiguous between that output column and
-- `staff.id`, and Postgres rejected it at call time with
-- "column reference "id" is ambiguous" (seen live trying to record a
-- repayment for Rafiq Mohimtuley). This was never caught because plpgsql
-- only resolves/validates the query the first time the function actually
-- runs, not at CREATE FUNCTION time.
--
-- Fix: qualify every unqualified `id` that refers to `staff.id` as
-- `staff.id` explicitly. No other logic changes.

create or replace function record_staff_advance_issue(
  p_staff_id uuid,
  p_org_id uuid,
  p_type text,
  p_amount numeric,
  p_issued_date date,
  p_payment_method text default 'cash',
  p_notes text default null,
  p_created_by uuid default null
)
returns table(id uuid, balance_before numeric, balance_after numeric) as $$
declare
  v_before numeric;
  v_after numeric;
  v_id uuid;
begin
  select advance_balance into v_before
  from staff where staff.id = p_staff_id and staff.organization_id = p_org_id
  for update;

  if not found then
    raise exception 'staff member % not found', p_staff_id;
  end if;

  v_before := coalesce(v_before, 0);
  v_after := v_before + p_amount;

  update staff set advance_balance = v_after where staff.id = p_staff_id;

  insert into staff_advances (
    organization_id, staff_id, type, amount, issued_date, payment_method, notes, created_by
  ) values (
    p_org_id, p_staff_id, p_type, p_amount, p_issued_date, p_payment_method, p_notes, p_created_by
  ) returning staff_advances.id into v_id;

  return query select v_id, v_before, v_after;
end;
$$ language plpgsql;

create or replace function record_staff_advance_repayment(
  p_staff_id uuid,
  p_org_id uuid,
  p_amount numeric,
  p_repayment_date date,
  p_payment_method text default 'cash',
  p_notes text default null,
  p_created_by uuid default null
)
returns table(id uuid, balance_before numeric, balance_after numeric) as $$
declare
  v_before numeric;
  v_after numeric;
  v_id uuid;
begin
  select advance_balance into v_before
  from staff where staff.id = p_staff_id and staff.organization_id = p_org_id
  for update;

  if not found then
    raise exception 'staff member % not found', p_staff_id;
  end if;

  v_before := coalesce(v_before, 0);

  if p_amount > v_before + 0.001 then
    raise exception 'Repayment amount % exceeds outstanding balance %', p_amount, v_before;
  end if;

  v_after := greatest(0, v_before - p_amount);

  update staff set advance_balance = v_after where staff.id = p_staff_id;

  insert into staff_advance_repayments (
    organization_id, staff_id, amount, repayment_date, payment_method, notes, created_by
  ) values (
    p_org_id, p_staff_id, p_amount, p_repayment_date, p_payment_method, p_notes, p_created_by
  ) returning staff_advance_repayments.id into v_id;

  return query select v_id, v_before, v_after;
end;
$$ language plpgsql;

grant execute on function record_staff_advance_issue(
  uuid, uuid, text, numeric, date, text, text, uuid
) to authenticated, service_role;

grant execute on function record_staff_advance_repayment(
  uuid, uuid, numeric, date, text, text, uuid
) to authenticated, service_role;
