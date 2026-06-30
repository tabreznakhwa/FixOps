ALTER TABLE supplier_payments ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,3) DEFAULT 0;
