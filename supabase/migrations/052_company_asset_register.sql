-- Full company asset register.
--
-- The `assets` table has existed since the initial schema but was dormant: it
-- held only identity + a broad "any authenticated org member may do anything"
-- policy. This migration turns it into a real register:
--
--   * extends `assets` with acquisition (supplier, payment, reference),
--     custodian, depreciation, and disposal fields;
--   * links each asset to exactly one `expenses` row (the capital purchase);
--   * adds an authoritative `asset_events` history table;
--   * hardens RLS so only active owner/admin/manager may SELECT and nobody may
--     write directly through the authenticated role;
--   * adds two service-role-only SECURITY DEFINER RPCs that atomically create
--     or update an asset together with its linked capital expense and history.
--
-- Asset purchases are capital expenditure, not operating expense. The linked
-- expense uses category `asset_purchase` and is excluded from operating-profit
-- metrics in the application. Depreciation is computed in the application
-- (src/lib/assets.ts) from purchase cost, salvage value, useful life and
-- disposal date — it is deliberately not stored, so a generated current-book-
-- value column cannot go stale.
--
-- Capital-purchase expenses must not be edited or deleted through the generic
-- expense module: a trigger rejects any such write unless the owning RPC sets a
-- transaction-local marker, so even a service-role write made outside the RPC
-- (SQL editor, another endpoint) cannot desynchronise the register.

-- ---------------------------------------------------------------------------
-- 1. Extend `assets`
-- ---------------------------------------------------------------------------

alter table public.assets
  alter column purchase_cost type numeric(12, 3) using purchase_cost::numeric;

alter table public.assets
  add column if not exists supplier_id uuid
    references public.suppliers(id) on delete set null,
  add column if not exists assigned_staff_id uuid
    references public.staff(id) on delete set null,
  add column if not exists payment_method text,
  add column if not exists purchase_reference text,
  add column if not exists depreciation_start_date date,
  add column if not exists useful_life_months integer,
  add column if not exists salvage_value numeric(12, 3) not null default 0,
  add column if not exists disposal_date date,
  add column if not exists disposal_method text,
  add column if not exists disposal_proceeds numeric(12, 3),
  add column if not exists disposal_reason text,
  add column if not exists updated_by uuid
    references public.users(id) on delete set null;

-- Legacy assets used `assigned_to` (a users id). Populate the new custodian
-- column where an unambiguous same-organization staff profile matches, so the
-- register is not empty-handed for pre-existing rows. Keep the legacy column.
update public.assets a
set assigned_staff_id = s.id
from public.staff s
where s.user_id = a.assigned_to
  and s.organization_id = a.organization_id
  and a.assigned_staff_id is null;

-- ---------------------------------------------------------------------------
-- 2. Extend `expenses` with the asset linkage
-- ---------------------------------------------------------------------------

alter table public.expenses
  add column if not exists asset_id uuid
    references public.assets(id) on delete restrict;

-- One-to-one: an expense is a capital asset purchase if and only if it points
-- at an asset. NOT VALID so any stray pre-existing `asset_purchase` rows do not
-- block the migration; the constraint still governs every new/updated row.
alter table public.expenses
  add constraint expenses_asset_category_check
  check ((asset_id is null) = (category is distinct from 'asset_purchase'))
  not valid;

-- One asset has one authoritative capital-purchase expense. Besides enforcing
-- the relationship documented above, this keeps every SELECT ... INTO lookup
-- inside the RPCs deterministic.
create unique index if not exists uq_expenses_asset_id
  on public.expenses(asset_id)
  where asset_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Asset history
-- ---------------------------------------------------------------------------

create table if not exists public.asset_events (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete restrict,
  event_type text not null check (
    event_type in ('created', 'updated', 'assigned', 'unassigned', 'status_changed', 'disposed')
  ),
  changes jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_asset_events_asset
  on public.asset_events(asset_id, created_at desc, id desc);
create index if not exists idx_asset_events_org
  on public.asset_events(organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. Indexes
-- ---------------------------------------------------------------------------

-- A trimmed, case-insensitive unique serial per organisation.
create unique index if not exists uq_assets_org_serial
  on public.assets(organization_id, lower(btrim(serial_number)))
  where serial_number is not null and btrim(serial_number) <> '';

create index if not exists idx_assets_org_status
  on public.assets(organization_id, status, asset_code);
create index if not exists idx_assets_org_category
  on public.assets(organization_id, category);
create index if not exists idx_assets_org_purchase_date
  on public.assets(organization_id, purchase_date desc);
create index if not exists idx_assets_org_supplier
  on public.assets(organization_id, supplier_id);
create index if not exists idx_assets_org_custodian
  on public.assets(organization_id, assigned_staff_id);

-- ---------------------------------------------------------------------------
-- 5. Business constraints (NOT VALID: enforced for new/updated rows only, so
--    any incomplete pre-existing rows cannot block application)
-- ---------------------------------------------------------------------------

alter table public.assets
  add constraint chk_assets_name
    check (btrim(asset_name) <> '' and char_length(asset_name) <= 200) not valid,
  add constraint chk_assets_category
    check (category in (
      'it_equipment', 'tools_equipment', 'vehicles', 'furniture_fixtures',
      'machinery', 'office_equipment', 'leasehold_improvements',
      'safety_equipment', 'other'
    )) not valid,
  add constraint chk_assets_cost
    check (purchase_cost is not null and purchase_cost > 0) not valid,
  add constraint chk_assets_payment_method
    check (payment_method in ('cash', 'bank_transfer', 'cheque')) not valid,
  add constraint chk_assets_useful_life
    check (useful_life_months between 1 and 1200) not valid,
  add constraint chk_assets_salvage
    check (salvage_value between 0 and purchase_cost) not valid,
  add constraint chk_assets_depr_date
    check (depreciation_start_date is null
           or depreciation_start_date >= purchase_date) not valid,
  add constraint chk_assets_warranty_date
    check (warranty_expiry is null or warranty_expiry >= purchase_date) not valid,
  add constraint chk_assets_service_date
    check (service_due_date is null or service_due_date >= purchase_date) not valid,
  add constraint chk_assets_disposal_date
    check (disposal_date is null or disposal_date >= purchase_date) not valid,
  add constraint chk_assets_disposal_proceeds
    check (disposal_proceeds is null or disposal_proceeds >= 0) not valid,
  add constraint chk_assets_disposal_method
    check (disposal_method is null
           or disposal_method in ('sold', 'scrapped', 'donated', 'lost', 'other'))
    not valid,
  add constraint chk_assets_assigned_custodian
    check (status is distinct from 'assigned' or assigned_staff_id is not null)
    not valid,
  add constraint chk_assets_disposed_fields
    check (status is distinct from 'disposed' or (
      disposal_date is not null
      and disposal_method is not null
      and disposal_reason is not null
      and disposal_proceeds is not null
    )) not valid,
  add constraint chk_assets_disposed_no_custodian
    check (status is distinct from 'disposed' or assigned_staff_id is null)
    not valid,
  add constraint chk_assets_nondisposed_no_disposal
    check (status = 'disposed' or (
      disposal_date is null
      and disposal_method is null
      and disposal_reason is null
      and disposal_proceeds is null
    )) not valid,
  add constraint chk_assets_required_acquisition
    check (
      purchase_date is not null
      and payment_method is not null
      and useful_life_months is not null
      and depreciation_start_date is not null
    ) not valid;

-- ---------------------------------------------------------------------------
-- 6. Row level security: owner/admin/manager SELECT only
-- ---------------------------------------------------------------------------

drop policy if exists "assets_org" on public.assets;

create policy "assets_select_owner_admin_manager" on public.assets
  for select
  using (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.organization_id = assets.organization_id
        and u.status = 'active'
        and u.role in ('owner', 'admin', 'manager')
    )
  );

create policy "asset_events_select_owner_admin_manager" on public.asset_events
  for select
  using (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.organization_id = asset_events.organization_id
        and u.status = 'active'
        and u.role in ('owner', 'admin', 'manager')
    )
  );

alter table public.asset_events enable row level security;

-- Direct authenticated writes are disallowed; all mutation goes through the
-- service-role-only RPCs below.
revoke all on public.assets from anon, authenticated;
grant select on public.assets to authenticated;
grant all on public.assets to service_role;

revoke all on public.asset_events from anon, authenticated;
grant select on public.asset_events to authenticated;
grant all on public.asset_events to service_role;

-- ---------------------------------------------------------------------------
-- 7. Guard linked capital expenses from direct edits/deletes
-- ---------------------------------------------------------------------------

create or replace function public.guard_asset_linked_expense_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.asset_id is not null then
      if coalesce(current_setting('fixops.allow_asset_expense_write', true), '') <> 'true' then
        raise exception 'Asset purchase expenses cannot be deleted directly; dispose of the asset instead';
      end if;
    end if;
    return old;
  end if;

  if coalesce(new.asset_id, old.asset_id) is not null then
    if coalesce(current_setting('fixops.allow_asset_expense_write', true), '') <> 'true' then
      raise exception 'Asset purchase expenses cannot be edited directly; edit the asset instead';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_asset_linked_expense_write on public.expenses;
create trigger trg_guard_asset_linked_expense_write
  before update or delete on public.expenses
  for each row
  execute function public.guard_asset_linked_expense_write();

-- ---------------------------------------------------------------------------
-- 8. Create an asset together with its capital expense and history
-- ---------------------------------------------------------------------------

create or replace function public.create_asset_with_expense(
  p_org_id uuid,
  p_actor_id uuid,
  p_asset_id uuid,
  p_asset_name text,
  p_category text,
  p_purchase_date date,
  p_purchase_cost numeric,
  p_payment_method text,
  p_useful_life_months integer,
  p_depreciation_start_date date,
  p_salvage_value numeric default 0,
  p_serial_number text default null,
  p_supplier_id uuid default null,
  p_purchase_reference text default null,
  p_location text default null,
  p_assigned_staff_id uuid default null,
  p_warranty_expiry date default null,
  p_service_due_date date default null,
  p_condition text default 'good',
  p_status text default 'available',
  p_notes text default null
)
returns table(asset_id uuid, expense_id uuid, asset_code text, created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(p_asset_name);
  v_serial text := nullif(btrim(p_serial_number), '');
  v_reference text := nullif(btrim(p_purchase_reference), '');
  v_location text := nullif(btrim(p_location), '');
  v_notes text := nullif(btrim(p_notes), '');
  v_salvage numeric := coalesce(p_salvage_value, 0);
  v_code text;
  v_expense_id uuid;
  v_existing assets%rowtype;
  v_kw_date date := (now() at time zone 'Asia/Kuwait')::date;
begin
  if p_org_id is null or p_actor_id is null or p_asset_id is null then
    raise exception 'Unauthorized';
  end if;

  if not exists (
    select 1 from public.users
    where id = p_actor_id
      and organization_id = p_org_id
      and status = 'active'
      and role in ('owner', 'admin')
  ) then
    raise exception 'Only an owner or admin can record assets';
  end if;

  -- Field validation ------------------------------------------------
  if v_name is null or char_length(v_name) > 200 then
    raise exception 'Asset name is required and must be 200 characters or fewer';
  end if;
  if p_category is null or p_category not in (
    'it_equipment', 'tools_equipment', 'vehicles', 'furniture_fixtures',
    'machinery', 'office_equipment', 'leasehold_improvements',
    'safety_equipment', 'other'
  ) then
    raise exception 'Select a valid asset category';
  end if;
  if p_purchase_date is null then
    raise exception 'Purchase date is required';
  end if;
  if p_purchase_date > v_kw_date then
    raise exception 'Purchase date cannot be in the future';
  end if;
  if p_purchase_cost is null or p_purchase_cost <= 0 or scale(p_purchase_cost) > 3 then
    raise exception 'Purchase cost must be greater than zero with at most 3 decimal places';
  end if;
  if p_payment_method is null or p_payment_method not in ('cash', 'bank_transfer', 'cheque') then
    raise exception 'Select a valid payment method';
  end if;
  if p_useful_life_months is null or p_useful_life_months not between 1 and 1200 then
    raise exception 'Useful life must be between 1 and 1,200 months';
  end if;
  if p_depreciation_start_date is null then
    raise exception 'Depreciation start date is required';
  end if;
  if p_depreciation_start_date < p_purchase_date then
    raise exception 'Depreciation cannot start before the purchase date';
  end if;
  if v_salvage < 0 or v_salvage > p_purchase_cost or scale(v_salvage) > 3 then
    raise exception 'Salvage value must be between 0 and the purchase cost';
  end if;
  if v_serial is not null and char_length(v_serial) > 100 then
    raise exception 'Serial number must be 100 characters or fewer';
  end if;
  if v_reference is not null and char_length(v_reference) > 100 then
    raise exception 'Reference must be 100 characters or fewer';
  end if;
  if v_location is not null and char_length(v_location) > 255 then
    raise exception 'Location must be 255 characters or fewer';
  end if;
  if v_notes is not null and char_length(v_notes) > 2000 then
    raise exception 'Notes must be 2,000 characters or fewer';
  end if;
  if p_condition is null or p_condition not in
     ('excellent', 'good', 'fair', 'poor', 'out_of_service') then
    raise exception 'Select a valid condition';
  end if;
  if p_status is null or p_status not in ('available', 'assigned', 'maintenance') then
    raise exception 'New assets cannot be created as disposed';
  end if;
  if p_warranty_expiry is not null and p_warranty_expiry < p_purchase_date then
    raise exception 'Warranty expiry cannot be before the purchase date';
  end if;
  if p_service_due_date is not null and p_service_due_date < p_purchase_date then
    raise exception 'Service due date cannot be before the purchase date';
  end if;
  if p_status = 'assigned' and p_assigned_staff_id is null then
    raise exception 'An assigned asset must have a custodian';
  end if;

  if p_supplier_id is not null and not exists (
    select 1 from public.suppliers
    where id = p_supplier_id and organization_id = p_org_id
  ) then
    raise exception 'Supplier does not belong to this organization';
  end if;

  if p_assigned_staff_id is not null and not exists (
    select 1 from public.staff
    where id = p_assigned_staff_id
      and organization_id = p_org_id
      and employment_status = 'active'
  ) then
    raise exception 'Custodian must be an active employee in this organization';
  end if;

  -- Idempotency: one asset UUID == one asset + expense, even across retries.
  perform pg_advisory_xact_lock(hashtextextended('fixops.asset:' || p_asset_id::text, 0));

  select * into v_existing from public.assets where id = p_asset_id;
  if found then
    if v_existing.organization_id <> p_org_id then
      raise exception 'Asset ID conflict';
    end if;
    select e.id into v_expense_id
    from public.expenses e where e.asset_id = v_existing.id;
    if v_expense_id is null then
      raise exception 'Asset exists without a linked purchase expense';
    end if;

    if v_existing.asset_name is distinct from v_name
       or v_existing.category is distinct from p_category
       or v_existing.purchase_date is distinct from p_purchase_date
       or v_existing.purchase_cost is distinct from p_purchase_cost
       or v_existing.payment_method is distinct from p_payment_method
       or v_existing.useful_life_months is distinct from p_useful_life_months
       or v_existing.depreciation_start_date is distinct from p_depreciation_start_date
       or v_existing.salvage_value is distinct from v_salvage
       or v_existing.serial_number is distinct from v_serial
       or v_existing.supplier_id is distinct from p_supplier_id
       or v_existing.purchase_reference is distinct from v_reference
       or v_existing.location is distinct from v_location
       or v_existing.assigned_staff_id is distinct from p_assigned_staff_id
       or v_existing.warranty_expiry is distinct from p_warranty_expiry
       or v_existing.service_due_date is distinct from p_service_due_date
       or v_existing.condition::text is distinct from p_condition
       or v_existing.status::text is distinct from p_status
       or v_existing.notes is distinct from v_notes
    then
      raise exception 'This asset request conflicts with an existing asset record';
    end if;

    return query select v_existing.id, v_expense_id, v_existing.asset_code, false;
    return;
  end if;

  v_code := public.generate_sequence_number(p_org_id, 'asset', 'AST-');

  insert into public.assets (
    id, organization_id, asset_code, asset_name, category, serial_number,
    purchase_date, purchase_cost, payment_method, purchase_reference,
    supplier_id, assigned_staff_id, location, condition, status,
    warranty_expiry, service_due_date, depreciation_start_date,
    useful_life_months, salvage_value, notes, created_by
  ) values (
    p_asset_id, p_org_id, v_code, v_name, p_category, v_serial,
    p_purchase_date, p_purchase_cost, p_payment_method, v_reference,
    p_supplier_id, p_assigned_staff_id, v_location,
    p_condition::public.asset_condition, p_status::public.asset_status,
    p_warranty_expiry, p_service_due_date, p_depreciation_start_date,
    p_useful_life_months, v_salvage, v_notes, p_actor_id
  );

  perform set_config('fixops.allow_asset_expense_write', 'true', true);

  insert into public.expenses (
    organization_id, expense_number, expense_date, category, description,
    amount, payment_method, reference_number, notes, asset_id, created_by
  ) values (
    p_org_id, 'EXP-' || v_code, p_purchase_date, 'asset_purchase',
    'Purchase of ' || v_code || ' — ' || v_name,
    p_purchase_cost, p_payment_method, v_reference, null, p_asset_id, p_actor_id
  )
  returning id into v_expense_id;

  insert into public.asset_events (
    organization_id, asset_id, event_type, changes, created_by
  ) values (
    p_org_id, p_asset_id, 'created',
    jsonb_build_object(
      'asset_code', jsonb_build_object('before', null, 'after', v_code),
      'asset_name', jsonb_build_object('before', null, 'after', v_name),
      'purchase_cost', jsonb_build_object('before', null, 'after', p_purchase_cost)
    ),
    p_actor_id
  );

  return query select p_asset_id, v_expense_id, v_code, true;
end;
$$;

revoke all on function public.create_asset_with_expense(
  uuid, uuid, uuid, text, text, date, numeric, text, integer, date, numeric,
  text, uuid, text, text, uuid, date, date, text, text, text
) from public;
revoke all on function public.create_asset_with_expense(
  uuid, uuid, uuid, text, text, date, numeric, text, integer, date, numeric,
  text, uuid, text, text, uuid, date, date, text, text, text
) from anon;
revoke all on function public.create_asset_with_expense(
  uuid, uuid, uuid, text, text, date, numeric, text, integer, date, numeric,
  text, uuid, text, text, uuid, date, date, text, text, text
) from authenticated;
grant execute on function public.create_asset_with_expense(
  uuid, uuid, uuid, text, text, date, numeric, text, integer, date, numeric,
  text, uuid, text, text, uuid, date, date, text, text, text
) to service_role;

-- ---------------------------------------------------------------------------
-- 9. Update an asset and, where purchase fields changed, its linked expense
-- ---------------------------------------------------------------------------

create or replace function public.update_asset(
  p_org_id uuid,
  p_actor_id uuid,
  p_asset_id uuid,
  p_expected_updated_at timestamptz,
  p_asset_name text,
  p_category text,
  p_purchase_date date,
  p_purchase_cost numeric,
  p_payment_method text,
  p_useful_life_months integer,
  p_depreciation_start_date date,
  p_salvage_value numeric,
  p_serial_number text,
  p_supplier_id uuid,
  p_purchase_reference text,
  p_location text,
  p_assigned_staff_id uuid,
  p_warranty_expiry date,
  p_service_due_date date,
  p_condition text,
  p_status text,
  p_notes text,
  p_disposal_date date,
  p_disposal_method text,
  p_disposal_proceeds numeric,
  p_disposal_reason text
)
returns table(asset_id uuid, expense_id uuid, updated_at timestamptz, changed boolean, history_event_type text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(p_asset_name);
  v_serial text := nullif(btrim(p_serial_number), '');
  v_reference text := nullif(btrim(p_purchase_reference), '');
  v_location text := nullif(btrim(p_location), '');
  v_notes text := nullif(btrim(p_notes), '');
  v_salvage numeric := coalesce(p_salvage_value, 0);
  v_disposal_method text := nullif(btrim(p_disposal_method), '');
  v_disposal_reason text := nullif(btrim(p_disposal_reason), '');
  v_old assets%rowtype;
  v_new_ts timestamptz := now();
  v_changes jsonb := '{}'::jsonb;
  v_event text := 'updated';
  v_expense_id uuid;
  v_kw_date date := (now() at time zone 'Asia/Kuwait')::date;
begin
  if p_org_id is null or p_actor_id is null or p_asset_id is null then
    raise exception 'Unauthorized';
  end if;

  if not exists (
    select 1 from public.users
    where id = p_actor_id
      and organization_id = p_org_id
      and status = 'active'
      and role in ('owner', 'admin')
  ) then
    raise exception 'Only an owner or admin can edit assets';
  end if;

  select * into v_old
  from public.assets
  where id = p_asset_id and organization_id = p_org_id
  for update;

  if not found then
    raise exception 'Asset not found';
  end if;

  if p_expected_updated_at is null or v_old.updated_at is distinct from p_expected_updated_at then
    raise exception 'This asset was changed by someone else; reload and try again';
  end if;

  -- Field validation ------------------------------------------------
  if v_name is null or char_length(v_name) > 200 then
    raise exception 'Asset name is required and must be 200 characters or fewer';
  end if;
  if p_category is null or p_category not in (
    'it_equipment', 'tools_equipment', 'vehicles', 'furniture_fixtures',
    'machinery', 'office_equipment', 'leasehold_improvements',
    'safety_equipment', 'other'
  ) then
    raise exception 'Select a valid asset category';
  end if;
  if p_purchase_date is null or p_purchase_date > v_kw_date then
    raise exception 'Purchase date is required and cannot be in the future';
  end if;
  if p_purchase_cost is null or p_purchase_cost <= 0 or scale(p_purchase_cost) > 3 then
    raise exception 'Purchase cost must be greater than zero with at most 3 decimal places';
  end if;
  if p_payment_method is null or p_payment_method not in ('cash', 'bank_transfer', 'cheque') then
    raise exception 'Select a valid payment method';
  end if;
  if p_useful_life_months is null or p_useful_life_months not between 1 and 1200 then
    raise exception 'Useful life must be between 1 and 1,200 months';
  end if;
  if p_depreciation_start_date is null or p_depreciation_start_date < p_purchase_date then
    raise exception 'Depreciation start date is required and cannot be before the purchase date';
  end if;
  if v_salvage < 0 or v_salvage > p_purchase_cost or scale(v_salvage) > 3 then
    raise exception 'Salvage value must be between 0 and the purchase cost';
  end if;
  if v_serial is not null and char_length(v_serial) > 100 then
    raise exception 'Serial number must be 100 characters or fewer';
  end if;
  if v_reference is not null and char_length(v_reference) > 100 then
    raise exception 'Reference must be 100 characters or fewer';
  end if;
  if v_location is not null and char_length(v_location) > 255 then
    raise exception 'Location must be 255 characters or fewer';
  end if;
  if v_notes is not null and char_length(v_notes) > 2000 then
    raise exception 'Notes must be 2,000 characters or fewer';
  end if;
  if p_condition is null or p_condition not in
     ('excellent', 'good', 'fair', 'poor', 'out_of_service') then
    raise exception 'Select a valid condition';
  end if;
  if p_status is null or p_status not in
     ('available', 'assigned', 'maintenance', 'disposed') then
    raise exception 'Select a valid status';
  end if;
  if p_warranty_expiry is not null and p_warranty_expiry < p_purchase_date then
    raise exception 'Warranty expiry cannot be before the purchase date';
  end if;
  if p_service_due_date is not null and p_service_due_date < p_purchase_date then
    raise exception 'Service due date cannot be before the purchase date';
  end if;
  if p_status = 'assigned' and p_assigned_staff_id is null then
    raise exception 'An assigned asset must have a custodian';
  end if;

  -- Disposal is terminal in v1.
  if v_old.status = 'disposed' and p_status <> 'disposed' then
    raise exception 'A disposed asset cannot be returned to an active status';
  end if;

  if p_status = 'disposed' then
    if p_disposal_date is null or p_disposal_date < v_old.purchase_date
       or p_disposal_date > v_kw_date then
      raise exception 'A disposal date on or after the purchase date is required';
    end if;
    if v_disposal_method is null
       or v_disposal_method not in ('sold', 'scrapped', 'donated', 'lost', 'other') then
      raise exception 'Select a valid disposal method';
    end if;
    if v_disposal_reason is null or char_length(v_disposal_reason) > 1000 then
      raise exception 'A disposal reason is required and must be 1,000 characters or fewer';
    end if;
    if p_disposal_proceeds is null or p_disposal_proceeds < 0 or scale(p_disposal_proceeds) > 3 then
      raise exception 'Disposal proceeds must be zero or more';
    end if;
    if p_assigned_staff_id is not null then
      raise exception 'A disposed asset cannot have a custodian';
    end if;
  else
    if p_disposal_date is not null or v_disposal_method is not null
       or p_disposal_proceeds is not null or v_disposal_reason is not null then
      raise exception 'Disposal details can only be set when disposing an asset';
    end if;
  end if;

  if p_supplier_id is not null and not exists (
    select 1 from public.suppliers
    where id = p_supplier_id and organization_id = p_org_id
  ) then
    raise exception 'Supplier does not belong to this organization';
  end if;

  if p_assigned_staff_id is not null and not exists (
    select 1 from public.staff
    where id = p_assigned_staff_id
      and organization_id = p_org_id
      and employment_status = 'active'
  ) then
    raise exception 'Custodian must be an active employee in this organization';
  end if;

  -- Field-level diff for history -----------------------------------
  if v_old.asset_name is distinct from v_name then
    v_changes := v_changes || jsonb_build_object('asset_name',
      jsonb_build_object('before', v_old.asset_name, 'after', v_name));
  end if;
  if v_old.category is distinct from p_category then
    v_changes := v_changes || jsonb_build_object('category',
      jsonb_build_object('before', v_old.category, 'after', p_category));
  end if;
  if v_old.purchase_date is distinct from p_purchase_date then
    v_changes := v_changes || jsonb_build_object('purchase_date',
      jsonb_build_object('before', v_old.purchase_date, 'after', p_purchase_date));
  end if;
  if v_old.purchase_cost is distinct from p_purchase_cost then
    v_changes := v_changes || jsonb_build_object('purchase_cost',
      jsonb_build_object('before', v_old.purchase_cost, 'after', p_purchase_cost));
  end if;
  if v_old.payment_method is distinct from p_payment_method then
    v_changes := v_changes || jsonb_build_object('payment_method',
      jsonb_build_object('before', v_old.payment_method, 'after', p_payment_method));
  end if;
  if v_old.useful_life_months is distinct from p_useful_life_months then
    v_changes := v_changes || jsonb_build_object('useful_life_months',
      jsonb_build_object('before', v_old.useful_life_months, 'after', p_useful_life_months));
  end if;
  if v_old.depreciation_start_date is distinct from p_depreciation_start_date then
    v_changes := v_changes || jsonb_build_object('depreciation_start_date',
      jsonb_build_object('before', v_old.depreciation_start_date, 'after', p_depreciation_start_date));
  end if;
  if v_old.salvage_value is distinct from v_salvage then
    v_changes := v_changes || jsonb_build_object('salvage_value',
      jsonb_build_object('before', v_old.salvage_value, 'after', v_salvage));
  end if;
  if v_old.serial_number is distinct from v_serial then
    v_changes := v_changes || jsonb_build_object('serial_number',
      jsonb_build_object('before', v_old.serial_number, 'after', v_serial));
  end if;
  if v_old.supplier_id is distinct from p_supplier_id then
    v_changes := v_changes || jsonb_build_object('supplier_id',
      jsonb_build_object('before', v_old.supplier_id, 'after', p_supplier_id));
  end if;
  if v_old.purchase_reference is distinct from v_reference then
    v_changes := v_changes || jsonb_build_object('purchase_reference',
      jsonb_build_object('before', v_old.purchase_reference, 'after', v_reference));
  end if;
  if v_old.location is distinct from v_location then
    v_changes := v_changes || jsonb_build_object('location',
      jsonb_build_object('before', v_old.location, 'after', v_location));
  end if;
  if v_old.assigned_staff_id is distinct from p_assigned_staff_id then
    v_changes := v_changes || jsonb_build_object('assigned_staff_id',
      jsonb_build_object('before', v_old.assigned_staff_id, 'after', p_assigned_staff_id));
    v_event := case when p_assigned_staff_id is null then 'unassigned' else 'assigned' end;
  end if;
  if v_old.warranty_expiry is distinct from p_warranty_expiry then
    v_changes := v_changes || jsonb_build_object('warranty_expiry',
      jsonb_build_object('before', v_old.warranty_expiry, 'after', p_warranty_expiry));
  end if;
  if v_old.service_due_date is distinct from p_service_due_date then
    v_changes := v_changes || jsonb_build_object('service_due_date',
      jsonb_build_object('before', v_old.service_due_date, 'after', p_service_due_date));
  end if;
  if v_old.condition::text is distinct from p_condition then
    v_changes := v_changes || jsonb_build_object('condition',
      jsonb_build_object('before', v_old.condition::text, 'after', p_condition));
  end if;
  if v_old.status::text is distinct from p_status then
    v_changes := v_changes || jsonb_build_object('status',
      jsonb_build_object('before', v_old.status::text, 'after', p_status));
    if v_event in ('updated', 'status_changed') then
      v_event := case when p_status = 'disposed' then 'disposed' else 'status_changed' end;
    end if;
  end if;
  if v_old.notes is distinct from v_notes then
    v_changes := v_changes || jsonb_build_object('notes',
      jsonb_build_object('before', v_old.notes, 'after', v_notes));
  end if;
  if v_old.disposal_date is distinct from p_disposal_date then
    v_changes := v_changes || jsonb_build_object('disposal_date',
      jsonb_build_object('before', v_old.disposal_date, 'after', p_disposal_date));
  end if;
  if v_old.disposal_method is distinct from v_disposal_method then
    v_changes := v_changes || jsonb_build_object('disposal_method',
      jsonb_build_object('before', v_old.disposal_method, 'after', v_disposal_method));
  end if;
  if v_old.disposal_proceeds is distinct from p_disposal_proceeds then
    v_changes := v_changes || jsonb_build_object('disposal_proceeds',
      jsonb_build_object('before', v_old.disposal_proceeds, 'after', p_disposal_proceeds));
  end if;
  if v_old.disposal_reason is distinct from v_disposal_reason then
    v_changes := v_changes || jsonb_build_object('disposal_reason',
      jsonb_build_object('before', v_old.disposal_reason, 'after', v_disposal_reason));
  end if;

  -- Disposal is the terminal business event and takes precedence over a
  -- simultaneous unassignment or other status change.
  if v_old.status::text is distinct from p_status and p_status = 'disposed' then
    v_event := 'disposed';
  end if;

  update public.assets set
    asset_name = v_name,
    category = p_category,
    purchase_date = p_purchase_date,
    purchase_cost = p_purchase_cost,
    payment_method = p_payment_method,
    useful_life_months = p_useful_life_months,
    depreciation_start_date = p_depreciation_start_date,
    salvage_value = v_salvage,
    serial_number = v_serial,
    supplier_id = p_supplier_id,
    purchase_reference = v_reference,
    location = v_location,
    assigned_staff_id = p_assigned_staff_id,
    warranty_expiry = p_warranty_expiry,
    service_due_date = p_service_due_date,
    condition = p_condition::public.asset_condition,
    status = p_status::public.asset_status,
    notes = v_notes,
    disposal_date = case when p_status = 'disposed' then p_disposal_date else null end,
    disposal_method = case when p_status = 'disposed' then v_disposal_method else null end,
    disposal_proceeds = case when p_status = 'disposed' then p_disposal_proceeds else null end,
    disposal_reason = case when p_status = 'disposed' then v_disposal_reason else null end,
    updated_by = p_actor_id,
    updated_at = v_new_ts
  where id = p_asset_id;

  -- Keep the linked expense in sync when purchase fields changed.
  select e.id into v_expense_id
  from public.expenses e where e.asset_id = p_asset_id;

  if v_old.asset_name is distinct from v_name
     or v_old.purchase_date is distinct from p_purchase_date
     or v_old.purchase_cost is distinct from p_purchase_cost
     or v_old.payment_method is distinct from p_payment_method
     or v_old.purchase_reference is distinct from v_reference then
    if v_expense_id is null then
      raise exception 'This asset has no linked purchase expense to update; reconcile it before editing purchase details';
    end if;
    perform set_config('fixops.allow_asset_expense_write', 'true', true);
    update public.expenses set
      expense_date = p_purchase_date,
      description = 'Purchase of ' || v_old.asset_code || ' — ' || v_name,
      amount = p_purchase_cost,
      payment_method = p_payment_method,
      reference_number = v_reference
    where id = v_expense_id and asset_id = p_asset_id;
  end if;

  if v_changes <> '{}'::jsonb then
    insert into public.asset_events (
      organization_id, asset_id, event_type, changes, created_by
    ) values (
      p_org_id, p_asset_id, v_event, v_changes, p_actor_id
    );
  end if;

  return query select p_asset_id, v_expense_id, v_new_ts, (v_changes <> '{}'::jsonb), v_event;
end;
$$;

revoke all on function public.update_asset(
  uuid, uuid, uuid, timestamptz, text, text, date, numeric, text, integer, date,
  numeric, text, uuid, text, text, uuid, date, date, text, text, text, date,
  text, numeric, text
) from public;
revoke all on function public.update_asset(
  uuid, uuid, uuid, timestamptz, text, text, date, numeric, text, integer, date,
  numeric, text, uuid, text, text, uuid, date, date, text, text, text, date,
  text, numeric, text
) from anon;
revoke all on function public.update_asset(
  uuid, uuid, uuid, timestamptz, text, text, date, numeric, text, integer, date,
  numeric, text, uuid, text, text, uuid, date, date, text, text, text, date,
  text, numeric, text
) from authenticated;
grant execute on function public.update_asset(
  uuid, uuid, uuid, timestamptz, text, text, date, numeric, text, integer, date,
  numeric, text, uuid, text, text, uuid, date, date, text, text, text, date,
  text, numeric, text
) to service_role;
