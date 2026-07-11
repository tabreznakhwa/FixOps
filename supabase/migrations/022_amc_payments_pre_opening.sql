-- Flag to mark AMC payments that are already included in the opening balance
-- These appear on the AMC contract but are excluded from Cash/Bank book (to avoid double-counting)
ALTER TABLE amc_payments ADD COLUMN IF NOT EXISTS is_pre_opening BOOLEAN NOT NULL DEFAULT FALSE;
