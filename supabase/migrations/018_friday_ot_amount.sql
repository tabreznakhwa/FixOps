-- Per-employee Friday/holiday OT daily amount (KWD)
ALTER TABLE staff ADD COLUMN IF NOT EXISTS friday_ot_amount DECIMAL(12,2) DEFAULT 0;

-- Store the actual Friday/holiday OT amount on each attendance record
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS friday_ot_amount DECIMAL(12,2) DEFAULT 0;
