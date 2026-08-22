-- Let owner/admin/manager add new expense types, instead of the hardcoded
-- category list built into NewExpenseForm/EditExpenseForm being the only
-- options. `expenses.category` is already free text (migration 009 has no
-- CHECK constraint on it) — this table just adds a shared, org-scoped
-- picklist so a custom type one manager adds shows up for everyone else too.

create table if not exists expense_categories (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  value text not null,
  label text not null,
  created_by uuid references users(id),
  created_at timestamptz default now(),
  unique(organization_id, value)
);

create index if not exists idx_expense_categories_org on expense_categories(organization_id);

alter table expense_categories enable row level security;

grant select, insert on expense_categories to authenticated;
grant select, insert, delete on expense_categories to service_role;

-- Any org member can see the custom categories (they need the full list to
-- file an expense), but only owner/admin/manager can add new ones.
drop policy if exists "org members can view expense categories" on expense_categories;
create policy "org members can view expense categories"
  on expense_categories for select
  using (organization_id = (select organization_id from users where id = auth.uid()));

drop policy if exists "owner/admin/manager can add expense categories" on expense_categories;
create policy "owner/admin/manager can add expense categories"
  on expense_categories for insert
  with check (
    organization_id = (select organization_id from users where id = auth.uid())
    and (select role from users where id = auth.uid()) in ('owner', 'admin', 'manager')
  );
