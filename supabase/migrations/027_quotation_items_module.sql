-- Quotation module line items and status support

alter table quotations drop constraint if exists quotations_status_check;
alter table quotations add constraint quotations_status_check
  check (status in ('draft', 'sent', 'approved', 'rejected', 'converted', 'expired'));

create table if not exists quotation_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  quotation_id uuid not null references quotations(id) on delete cascade,
  description text not null,
  quantity decimal(12,3) default 1,
  unit_price decimal(12,3) not null default 0,
  total_price decimal(12,3) not null default 0,
  sort_order integer default 0,
  created_at timestamptz default now()
);

create index if not exists quotation_items_quotation_id_idx on quotation_items(quotation_id, sort_order);

alter table quotation_items enable row level security;

drop policy if exists "quotation_items_org" on quotation_items;
create policy "quotation_items_org" on quotation_items
  for all using (organization_id = get_user_organization_id());

grant select, insert, update, delete on quotation_items to authenticated;
grant select, insert, update, delete on quotation_items to service_role;
