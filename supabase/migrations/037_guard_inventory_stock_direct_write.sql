-- Compressor ZR-72's current_stock was silently overwritten to 0 directly
-- against the database on 2026-08-29 16:12 — outside the app entirely,
-- bypassing adjust_inventory_stock_logged / set_inventory_stock_logged
-- (migration 034) and leaving zero row in inventory_transactions to explain
-- it. Every application code path was already confirmed to go through one
-- of those two RPCs; the leak was a manual write run straight against the
-- table (SQL editor / Table Editor), which no application-level fix can
-- prevent.
--
-- This adds a trigger that rejects any change to current_stock unless it
-- carries a marker the two logged RPCs set immediately before their own
-- UPDATE. That marker is a transaction-local setting (set_config(..., true),
-- equivalent to SET LOCAL), so it's automatically gone once the RPC's call
-- finishes — nothing else can forge it. This blocks direct edits from any
-- role, including a superuser running SQL by hand, which is exactly the
-- scenario that caused this.

create or replace function guard_inventory_stock_direct_write()
returns trigger as $$
begin
  if new.current_stock is distinct from old.current_stock then
    if coalesce(current_setting('fixops.allow_stock_write', true), '') <> 'true' then
      raise exception
        'current_stock cannot be changed directly (attempted % -> % on item %). Use adjust_inventory_stock_logged or set_inventory_stock_logged so the change is recorded in inventory_transactions.',
        old.current_stock, new.current_stock, old.id;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_guard_inventory_stock_direct_write on inventory_items;
create trigger trg_guard_inventory_stock_direct_write
  before update on inventory_items
  for each row
  execute function guard_inventory_stock_direct_write();

-- Re-create both logged RPCs with the marker set right before their own
-- UPDATE. Logic is otherwise unchanged from migration 034.

create or replace function adjust_inventory_stock_logged(
  p_item_id uuid,
  p_delta numeric,
  p_org_id uuid,
  p_transaction_type inventory_transaction_type,
  p_unit_cost numeric default 0,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_notes text default null,
  p_created_by uuid default null
)
returns table(stock_before numeric, stock_after numeric) as $$
declare
  v_before numeric;
  v_after numeric;
begin
  perform set_config('fixops.allow_stock_write', 'true', true);

  update inventory_items
  set current_stock = current_stock + p_delta, updated_at = now()
  where id = p_item_id
  returning current_stock - p_delta, current_stock into v_before, v_after;

  if not found then
    raise exception 'inventory item % not found', p_item_id;
  end if;

  insert into inventory_transactions (
    organization_id, item_id, transaction_type, quantity, unit_cost, total_cost,
    stock_before, stock_after, reference_type, reference_id, notes, created_by
  ) values (
    p_org_id, p_item_id, p_transaction_type, abs(p_delta), p_unit_cost,
    abs(p_delta) * p_unit_cost, v_before, v_after, p_reference_type, p_reference_id,
    p_notes, p_created_by
  );

  return query select v_before, v_after;
end;
$$ language plpgsql;

create or replace function set_inventory_stock_logged(
  p_item_id uuid,
  p_new_stock numeric,
  p_org_id uuid,
  p_transaction_type inventory_transaction_type,
  p_unit_cost numeric default 0,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_notes text default null,
  p_created_by uuid default null
)
returns table(stock_before numeric, stock_after numeric) as $$
declare
  v_before numeric;
  v_after numeric;
begin
  perform set_config('fixops.allow_stock_write', 'true', true);

  select current_stock into v_before from inventory_items where id = p_item_id for update;
  if not found then
    raise exception 'inventory item % not found', p_item_id;
  end if;

  update inventory_items
  set current_stock = p_new_stock, updated_at = now()
  where id = p_item_id
  returning current_stock into v_after;

  if v_after <> v_before then
    insert into inventory_transactions (
      organization_id, item_id, transaction_type, quantity, unit_cost, total_cost,
      stock_before, stock_after, reference_type, reference_id, notes, created_by
    ) values (
      p_org_id, p_item_id, p_transaction_type, v_after - v_before, p_unit_cost,
      abs(v_after - v_before) * p_unit_cost, v_before, v_after, p_reference_type,
      p_reference_id, p_notes, p_created_by
    );
  end if;

  return query select v_before, v_after;
end;
$$ language plpgsql;

grant execute on function adjust_inventory_stock_logged(
  uuid, numeric, uuid, inventory_transaction_type, numeric, text, uuid, text, uuid
) to authenticated, service_role;

grant execute on function set_inventory_stock_logged(
  uuid, numeric, uuid, inventory_transaction_type, numeric, text, uuid, text, uuid
) to authenticated, service_role;
