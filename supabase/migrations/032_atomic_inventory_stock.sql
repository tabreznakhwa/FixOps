-- Atomic inventory stock updates.
--
-- Every place that changed inventory_items.current_stock used to do
-- SELECT current_stock -> compute new value in JS -> UPDATE current_stock,
-- across two separate round-trips. Two requests touching the same item at
-- nearly the same time could race: the second UPDATE would silently
-- overwrite the first based on data it read before the first write landed
-- (a classic lost-update). This was proven live on "High Pressure Switch",
-- whose inventory_transactions stock_before/stock_after chain has breaks
-- even after the item's other data was otherwise clean.
--
-- Both functions below do the read-and-write as a single atomic statement,
-- so concurrent callers can no longer lose each other's updates.

-- Relative change (issue / return / receive / cancel a purchase, etc).
create or replace function adjust_inventory_stock(p_item_id uuid, p_delta numeric)
returns table(stock_before numeric, stock_after numeric) as $$
begin
  return query
  update inventory_items
  set current_stock = current_stock + p_delta, updated_at = now()
  where id = p_item_id
  returning current_stock - p_delta, current_stock;

  if not found then
    raise exception 'inventory item % not found', p_item_id;
  end if;
end;
$$ language plpgsql;

-- Absolute set (manual correction / opening stock / physical count entry).
create or replace function set_inventory_stock(p_item_id uuid, p_new_stock numeric)
returns table(stock_before numeric, stock_after numeric) as $$
begin
  return query
  with old as (
    select current_stock from inventory_items where id = p_item_id for update
  )
  update inventory_items
  set current_stock = p_new_stock, updated_at = now()
  where id = p_item_id
  returning (select current_stock from old), current_stock;

  if not found then
    raise exception 'inventory item % not found', p_item_id;
  end if;
end;
$$ language plpgsql;

grant execute on function adjust_inventory_stock(uuid, numeric) to authenticated, service_role;
grant execute on function set_inventory_stock(uuid, numeric) to authenticated, service_role;
