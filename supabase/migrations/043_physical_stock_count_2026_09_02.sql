-- Reconciliation against a physical stock count sheet dated 2 Sept 2026
-- (photographed and provided directly by the owner), taken the day after
-- migration 042 reconciled 15 items to their ledger balance.
--
-- Comparing that physical count to the post-042 database turned up 27
-- mismatches across all 60 active items — far more, and in several cases
-- far larger (Filter Drier 3/8": 1 in system vs 9 physical; Thermostat
-- Honeywell N100: 1 vs 7; Delay Timer: 59 vs 65; Low Pressure Switch and R22
-- Freon Gas: 0 vs 4 each), than the ±0.25..±2 "silent direct-write" pattern
-- fixed in 042. That earlier fix corrected real drift, but this physical
-- count shows a separate, larger problem: real stock that was received/on
-- the shelf and was simply never entered into the system at all (and, for a
-- handful of items, system stock reading higher than what's physically on
-- hand). A physical count is ground truth for both directions.
--
-- This also resolves the one item 042 deliberately left untouched:
-- Compressor ZR-54 (ITM00003) had current_stock=1 against a ledger balance
-- of 0, with an internally inconsistent purchase history, so 042 left it for
-- a physical check rather than guessing. The physical count confirms 0 —
-- i.e. the ledger, not current_stock, was right — so it's corrected here.
--
-- Each item reconciled via set_inventory_stock_logged (transaction_type
-- 'adjustment', reference_type 'stock_take'), matching the same pattern
-- already used for the "Physical stock count - 19 Aug 2026" and "Physical
-- stock count 11 Aug 2026" entries already present in this org's ledger.

select set_inventory_stock_logged(
  'e3de33c9-116d-4169-b8a4-ff24eaf34cfe', 23, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'stock_take', null,
  'Physical stock count - 2 Sept 2026 sheet (ITM00035 Capacitor 10 MFD, was 26)', null);

select set_inventory_stock_logged(
  'aea7d30c-1226-4868-a10a-ecfb9724a260', 19, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'stock_take', null,
  'Physical stock count - 2 Sept 2026 sheet (ITM00048 Capacitor 15 MFD, was 16)', null);

select set_inventory_stock_logged(
  '40a226ae-e4ee-4150-9edd-859dfa1e8bd9', 14, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'stock_take', null,
  'Physical stock count - 2 Sept 2026 sheet (ITM00036 Capacitor 25 MFD, was 15)', null);

select set_inventory_stock_logged(
  '16d3d711-2c84-43d3-9194-aaaa935cdd78', 12, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'stock_take', null,
  'Physical stock count - 2 Sept 2026 sheet (ITM00037 Capacitor 30 MFD, was 14)', null);

select set_inventory_stock_logged(
  '4190a2e7-ed90-47a6-b771-8f4bd57b9d96', 10, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'stock_take', null,
  'Physical stock count - 2 Sept 2026 sheet (ITM00034 Capacitor 5 MFD, was 15)', null);

select set_inventory_stock_logged(
  'befa3098-c1f3-4984-855d-c27ab05184da', 13, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'stock_take', null,
  'Physical stock count - 2 Sept 2026 sheet (ITM00038 Capacitor 50 MFD, was 15)', null);

select set_inventory_stock_logged(
  '07af942e-aa23-4414-840d-6df10cfefefc', 8, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'stock_take', null,
  'Physical stock count - 2 Sept 2026 sheet (ITM00044 Capacitor 60 MFD, was 9)', null);

select set_inventory_stock_logged(
  '72913560-3e5f-45b4-afdf-aebfdbefb794', 17, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'stock_take', null,
  'Physical stock count - 2 Sept 2026 sheet (ITM00059 Capacitor 7.5 MFD, was 18)', null);

select set_inventory_stock_logged(
  '5d8cf2c3-5aa6-4f76-b5d5-74c119adbfe4', 11, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'stock_take', null,
  'Physical stock count - 2 Sept 2026 sheet (ITM00033 Carrier 1/4 HP Condenser Fan Motor., was 12)', null);

select set_inventory_stock_logged(
  '56a80bf8-c370-4991-af60-dcebb8a48906', 1, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'stock_take', null,
  'Physical stock count - 2 Sept 2026 sheet (ITM00049 Coil Cleaner, was 0.25)', null);

select set_inventory_stock_logged(
  '2a1e5c8d-cad6-46f9-b5c7-684d78f87783', 0, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'stock_take', null,
  'Physical stock count - 2 Sept 2026 sheet (ITM00003 Compressor ZR-54, was 1)', null);

select set_inventory_stock_logged(
  '3516d463-5c20-439d-a82a-3f87581fd5b7', 114, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'stock_take', null,
  'Physical stock count - 2 Sept 2026 sheet (ITM00013 Contactor 3 Pole 24 V Coil., was 106)', null);

select set_inventory_stock_logged(
  'e2ff93e0-1869-4180-b952-4bbdc5c0c7eb', 10, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'stock_take', null,
  'Physical stock count - 2 Sept 2026 sheet (ITM00014 Contactor 3 Pole 240 V Coil., was 9)', null);

select set_inventory_stock_logged(
  '40412f48-288e-4bc1-8540-18bc14e24185', 65, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'stock_take', null,
  'Physical stock count - 2 Sept 2026 sheet (ITM00019 Delay Timer, was 59)', null);

select set_inventory_stock_logged(
  'cd0bac00-4f77-4da0-9ed0-993c8d40f05a', 9, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'stock_take', null,
  'Physical stock count - 2 Sept 2026 sheet (ITM00023 ELCB 40 Amps., was 7)', null);

select set_inventory_stock_logged(
  '3ded000f-57cf-46d1-9d37-c7437d039097', 9, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'stock_take', null,
  'Physical stock count - 2 Sept 2026 sheet (ITM00025 Filter Drier 1/2", was 8)', null);

select set_inventory_stock_logged(
  '509ee28d-be49-4dc6-a4d2-ea7d0efe3a18', 9, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'stock_take', null,
  'Physical stock count - 2 Sept 2026 sheet (ITM00022 Filter Drier 3/8", was 1)', null);

select set_inventory_stock_logged(
  'df871795-a6bf-433f-9340-52eacc707b14', 5, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'stock_take', null,
  'Physical stock count - 2 Sept 2026 sheet (ITM00026 Filter Drier 5/8", was 4)', null);

select set_inventory_stock_logged(
  '7f79fd93-7a57-4355-9fbf-2b0430a166ac', 15, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'stock_take', null,
  'Physical stock count - 2 Sept 2026 sheet (ITM00017 High Pressure Switch, was 14)', null);

select set_inventory_stock_logged(
  'fb80e917-b534-4fee-9f0b-12c8f88ebbff', 15, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'stock_take', null,
  'Physical stock count - 2 Sept 2026 sheet (ITM00057 Isolator 3 Pole / 40 Amps, was 16)', null);

select set_inventory_stock_logged(
  '60648857-fa45-4d6e-999f-4de531d0236b', 4, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'stock_take', null,
  'Physical stock count - 2 Sept 2026 sheet (ITM00018 Low Pressure Switch, was 0)', null);

select set_inventory_stock_logged(
  '0a919bcf-1321-46f5-8f31-7488ac57c716', 26, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'stock_take', null,
  'Physical stock count - 2 Sept 2026 sheet (ITM00020 Phase Preventor, was 27)', null);

select set_inventory_stock_logged(
  '3f68648b-5c23-46b6-b848-3b3ac9852eac', 4, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'stock_take', null,
  'Physical stock count - 2 Sept 2026 sheet (ITM00021 R22 Freon Gas Refron 50 lbs-India, was 0)', null);

select set_inventory_stock_logged(
  '52b4655e-47f5-4562-8f6b-b9514749bbac', 2, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'stock_take', null,
  'Physical stock count - 2 Sept 2026 sheet (ITM00052 Refrigerant R-141B Gas 30 lbs., was 2.5)', null);

select set_inventory_stock_logged(
  '73e7029c-a0b2-4d14-96ea-979b43118c35', 1, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'stock_take', null,
  'Physical stock count - 2 Sept 2026 sheet (ITM00054 Refrigerant R-410A Gas 25 LBS, India., was 1.05)', null);

select set_inventory_stock_logged(
  '69c59883-6843-4e3a-af8a-6fb7f3f46787', 4, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'stock_take', null,
  'Physical stock count - 2 Sept 2026 sheet (ITM00030 Relay 24V 6 Pin, was 1)', null);

select set_inventory_stock_logged(
  '8496ad4f-2063-4f00-9d21-f11f7204179b', 7, 'a9e389e2-4047-48bd-91e9-a2a5b149247a',
  'adjustment', 0, 'stock_take', null,
  'Physical stock count - 2 Sept 2026 sheet (ITM00029 Thermostat Honeywell N100, was 1)', null);
