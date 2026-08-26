-- Staff advances/loans could be issued but never repaid outside of a payroll
-- advance_deduction — there was no way to enter a direct cash/bank repayment,
-- so an employee paying back a loan had nowhere to be recorded: the
-- outstanding balance stayed wrong forever, and neither Bank Book, Cash
-- Book, nor the Staff Ledger had any inflow path for it.
--
-- Kept as its own table (not a new `type` on staff_advances) so "money
-- given" and "money received back" stay two distinct, unambiguous flows —
-- every existing place that reads staff_advances (Bank Book, Cash Book,
-- Staff Ledger, StaffAdvancePanel) currently assumes every row there is an
-- outgoing debit, and this avoids retrofitting that assumption.
create table if not exists staff_advance_repayments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  staff_id uuid not null references staff(id) on delete cascade,
  amount numeric not null check (amount > 0),
  repayment_date date not null,
  payment_method text default 'cash',
  notes text,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

-- Issuing an advance/loan previously updated staff.advance_balance with a
-- SELECT-then-compute-in-JS-then-UPDATE — the same race-condition class
-- already fixed for inventory this session (migration 034). Folding the
-- staff_advances insert and the balance update into one PL/pgSQL call, with
-- a row lock, closes that race the same way adjust_inventory_stock_logged
-- did for stock.
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
  from staff where id = p_staff_id and organization_id = p_org_id
  for update;

  if not found then
    raise exception 'staff member % not found', p_staff_id;
  end if;

  v_before := coalesce(v_before, 0);
  v_after := v_before + p_amount;

  update staff set advance_balance = v_after where id = p_staff_id;

  insert into staff_advances (
    organization_id, staff_id, type, amount, issued_date, payment_method, notes, created_by
  ) values (
    p_org_id, p_staff_id, p_type, p_amount, p_issued_date, p_payment_method, p_notes, p_created_by
  ) returning staff_advances.id into v_id;

  return query select v_id, v_before, v_after;
end;
$$ language plpgsql;

-- Mirror of the above for a repayment: locks the same row, rejects a
-- repayment larger than the current outstanding balance (this check runs
-- inside the locked transaction, so it's the actual source of truth — not
-- a best-effort pre-check that a concurrent request could race past), then
-- decrements the balance and inserts the matching ledger row atomically.
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
  from staff where id = p_staff_id and organization_id = p_org_id
  for update;

  if not found then
    raise exception 'staff member % not found', p_staff_id;
  end if;

  v_before := coalesce(v_before, 0);

  if p_amount > v_before + 0.001 then
    raise exception 'Repayment amount % exceeds outstanding balance %', p_amount, v_before;
  end if;

  v_after := greatest(0, v_before - p_amount);

  update staff set advance_balance = v_after where id = p_staff_id;

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
