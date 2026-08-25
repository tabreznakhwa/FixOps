-- Fold the atomic stock RPC (migration 032) and its paired inventory_transactions
-- ledger insert into a single database transaction.
--
-- adjust_inventory_stock / set_inventory_stock made the stock change itself
-- race-free, but every API route still did the change and the ledger insert
-- as two separate round trips. Each call was atomic on its own, but the pair
-- wasn't: if the second call (the ledger insert) failed for any reason after
-- the first had already landed, current_stock moved with zero audit trail.
-- Several call sites even swallow that second failure on purpose, so a stock
-- change that's already been issued/paid for can't be undone by a logging
-- problem — which is exactly what happened live to Compressor ZR-72 on
-- 2026-08-24: a clean, fully-chained transaction history ending at
-- stock_after = 1, then current_stock silently at 0 forty minutes later with
-- no matching ledger row.
--
-- These "_logged" variants do the stock UPDATE and the ledger INSERT inside
-- one PL/pgSQL function, so within a single call they always succeed or fail
-- together — there is no longer a window where the two can disagree.
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

-- Same, for an absolute set (manual correction / opening stock). Only writes
-- a ledger row when the value actually changes, matching the existing
-- set_inventory_stock callers' behaviour.
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

comment on function adjust_inventory_stock(uuid, numeric) is
  'Superseded by adjust_inventory_stock_logged for all call sites that also write a ledger row. Left in place — not dropped — in case anything still needs a bare stock move with no matching inventory_transactions entry.';
comment on function set_inventory_stock(uuid, numeric) is
  'Superseded by set_inventory_stock_logged for all call sites that also write a ledger row. Left in place — not dropped — in case anything still needs a bare stock move with no matching inventory_transactions entry.';
