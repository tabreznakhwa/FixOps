-- Disable the old inventory_transactions trigger that recalculates current_stock
-- from the incomplete historical ledger.
--
-- The app now owns stock mutations through the atomic RPCs in migration 032:
--   - adjust_inventory_stock(item, delta)
--   - set_inventory_stock(item, absolute_stock)
--
-- Keeping trg_inventory_stock enabled is unsafe because it overwrites the RPC's
-- current_stock value after every ledger insert by summing inventory_transactions.
-- That ledger is intentionally not a complete source of stock truth yet because
-- pre-11-Aug issued parts were missing and some historical opening-stock rows
-- recorded absolute values instead of deltas.

drop trigger if exists trg_inventory_stock on inventory_transactions;

-- Leave the old function in place for audit/history; without the trigger it is inert.
comment on function update_inventory_stock() is
  'Deprecated/inert: trg_inventory_stock was dropped in migration 033. Stock is maintained by adjust_inventory_stock/set_inventory_stock RPCs; inventory_transactions is the ledger, not the source of truth until historical backfill is complete.';
