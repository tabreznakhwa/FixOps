-- Technicians were seeing 0 (or otherwise too-low) parts for several items.
-- Audit: compared inventory_items.current_stock against the balance implied
-- by each item's own inventory_transactions ledger (its most recent
-- stock_after). 16 of 60 active items in this org disagree with their own
-- ledger, with zero transaction row explaining the difference — the exact
-- signature already diagnosed and fixed once for Compressor ZR-72 in
-- migration 037: a direct write against current_stock, bypassing
-- adjust_inventory_stock_logged/set_inventory_stock_logged, made before that
-- migration's guard trigger existed (every one of these items was last
-- touched between 2026-08-11 and 2026-08-29, all before or at the trigger's
-- rollout). Migration 037 already blocks any *new* occurrence of this; this
-- migration only repairs the 15 legacy items where current_stock reads too
-- low (the pattern actually causing "0 parts"), reconciling each back up to
-- its own ledger's last known-good balance via the logged RPC so the
-- correction itself leaves a proper audit trail instead of repeating the
-- same silent-write problem.
--
-- One item (ITM00003 Compressor ZR-54) drifted the other way — current_stock
-- reads 1 *higher* than its ledger, and its own purchase history is
-- internally inconsistent (three separate purchase-invoice transactions each
-- claim stock_before = 0, which can't all be true) — deliberately left
-- untouched here pending a physical stock count, since a data reconciliation
-- shouldn't guess in the direction that improves the more actionable
-- problem's optics.

select set_inventory_stock_logged(
  '40412f48-288e-4bc1-8540-18bc14e24185', 59, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'manual_adjustment', null,
  'Data correction 2026-09-03: reconciled to ledger (ITM00019 Delay Timer, was 58)', null);

select set_inventory_stock_logged(
  '0a919bcf-1321-46f5-8f31-7488ac57c716', 27, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'manual_adjustment', null,
  'Data correction 2026-09-03: reconciled to ledger (ITM00020 Phase Preventor, was 26)', null);

select set_inventory_stock_logged(
  'cd0bac00-4f77-4da0-9ed0-993c8d40f05a', 7, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'manual_adjustment', null,
  'Data correction 2026-09-03: reconciled to ledger (ITM00023 ELCB 40 Amps, was 6)', null);

select set_inventory_stock_logged(
  '8496ad4f-2063-4f00-9d21-f11f7204179b', 1, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'manual_adjustment', null,
  'Data correction 2026-09-03: reconciled to ledger (ITM00029 Thermostat Honeywell N100, was 0)', null);

select set_inventory_stock_logged(
  '5d8cf2c3-5aa6-4f76-b5d5-74c119adbfe4', 12, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'manual_adjustment', null,
  'Data correction 2026-09-03: reconciled to ledger (ITM00033 Carrier 1/4 HP Condenser Fan Motor, was 11)', null);

select set_inventory_stock_logged(
  'e3de33c9-116d-4169-b8a4-ff24eaf34cfe', 26, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'manual_adjustment', null,
  'Data correction 2026-09-03: reconciled to ledger (ITM00035 Capacitor 10 MFD, was 25)', null);

select set_inventory_stock_logged(
  'd459a64f-8ceb-4aa8-9fdf-1eca4c195daf', 1, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'manual_adjustment', null,
  'Data correction 2026-09-03: reconciled to ledger (ITM00041 Condenser Fan Motor 0.6 HP, was 0)', null);

select set_inventory_stock_logged(
  '2cf47329-6f62-4fed-8184-aa696f6f62f8', 3, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'manual_adjustment', null,
  'Data correction 2026-09-03: reconciled to ledger (ITM00045 Contactor Togami PAK-12J 24V Coil, was 2)', null);

select set_inventory_stock_logged(
  'aea7d30c-1226-4868-a10a-ecfb9724a260', 16, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'manual_adjustment', null,
  'Data correction 2026-09-03: reconciled to ledger (ITM00048 Capacitor 15 MFD, was 15)', null);

select set_inventory_stock_logged(
  '56a80bf8-c370-4991-af60-dcebb8a48906', 0.25, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'manual_adjustment', null,
  'Data correction 2026-09-03: reconciled to ledger (ITM00049 Coil Cleaner, was 0)', null);

select set_inventory_stock_logged(
  'ad7c1f2f-ef52-4d32-8a12-0f7b64897785', 6, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'manual_adjustment', null,
  'Data correction 2026-09-03: reconciled to ledger (ITM00051 Capacitor 12.5 MFD, was 4)', null);

select set_inventory_stock_logged(
  '52b4655e-47f5-4562-8f6b-b9514749bbac', 2.5, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'manual_adjustment', null,
  'Data correction 2026-09-03: reconciled to ledger (ITM00052 Refrigerant R-141B Gas 30 lbs, was 2)', null);

select set_inventory_stock_logged(
  'c9606ed2-76a1-499b-a515-44e583a2d675', 3, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'manual_adjustment', null,
  'Data correction 2026-09-03: reconciled to ledger (ITM00056 Contactor Togami PAK-26J-240V, was 2)', null);

select set_inventory_stock_logged(
  'fb80e917-b534-4fee-9f0b-12c8f88ebbff', 16, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'manual_adjustment', null,
  'Data correction 2026-09-03: reconciled to ledger (ITM00057 Isolator 3 Pole / 40 Amps, was 15)', null);

select set_inventory_stock_logged(
  'a1208bc0-bbd8-4467-9354-01efda622be4', 9, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'manual_adjustment', null,
  'Data correction 2026-09-03: reconciled to ledger (ITM00061 Capacitor 40 MFD, was 8)', null);

-- ITM00003 Compressor ZR-54 intentionally NOT corrected here — see comment above.
