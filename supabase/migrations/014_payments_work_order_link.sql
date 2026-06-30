ALTER TABLE payments ADD COLUMN IF NOT EXISTS work_order_id UUID REFERENCES work_orders(id);

-- Backfill existing work-order payments (recorded via "Collect Payment" before this column existed)
-- so they can be linked to an invoice created later for the same work order.
UPDATE payments p
SET work_order_id = wo.id
FROM work_orders wo
WHERE p.work_order_id IS NULL
  AND p.notes = 'Work order payment — ' || wo.work_order_number;
