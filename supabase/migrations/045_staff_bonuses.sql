-- Separately-paid staff bonuses. A bonus is an appreciation payment made
-- OUTSIDE the payroll run, so it must not live in salary_slips (those belong
-- to a salary_run and are "payroll"), must not live in staff_advances (those
-- raise advance_balance and are recoverable from future salaries), and must
-- not live in expenses (those are not per-employee). Its own table lets every
-- reader add it explicitly, so it is counted exactly once and nowhere
-- implicitly.
--
-- Correction model: a row is never hard-deleted. `is_voided = true` removes it
-- from every total (cash book, bank book, staff ledger, insights) while the
-- original record and its `void_reason` stay behind for the audit trail. This
-- honours the "no data is deleted" rule the same way `payments.is_cancelled`
-- does for receipts.
create table if not exists staff_bonuses (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  staff_id        uuid not null references staff(id) on delete cascade,
  bonus_number    text not null,
  bonus_date      date not null default current_date,   -- the payment date (backdatable)
  amount          numeric(12,3) not null check (amount > 0),
  payment_mode    text not null default 'cash'
                  check (payment_mode in ('cash','bank_transfer','cheque','pos','card','online','knet')),
  notes           text,                                  -- reason / notes
  is_voided       boolean not null default false,
  void_reason     text,
  voided_by       uuid references users(id),
  voided_at       timestamptz,
  idempotency_key text,                                  -- client-supplied, retry-safe
  created_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, bonus_number),
  unique (organization_id, idempotency_key)
);

create index if not exists idx_staff_bonuses_org_staff on staff_bonuses(organization_id, staff_id);
create index if not exists idx_staff_bonuses_org_date  on staff_bonuses(organization_id, bonus_date);

alter table staff_bonuses enable row level security;

-- Everyone in the org can read (the books, ledger and insights render for
-- whatever roles are allowed to open those pages); only HR/finance roles can
-- create or change a bonus. Void is an UPDATE, so no DELETE policy exists.
create policy "staff_bonuses_select_org" on staff_bonuses
  for select using (organization_id = get_user_organization_id());

create policy "staff_bonuses_insert_org" on staff_bonuses
  for insert with check (
    organization_id = get_user_organization_id()
    and get_user_role() in ('owner','admin','hr','manager')
  );

create policy "staff_bonuses_update_org" on staff_bonuses
  for update using (
    organization_id = get_user_organization_id()
    and get_user_role() in ('owner','admin','hr','manager')
  );

grant select, insert, update on staff_bonuses to authenticated;
grant select, insert, update, delete on staff_bonuses to service_role;
