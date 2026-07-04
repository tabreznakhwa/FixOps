-- Opening advance/loan balances (pre-app historical amounts)
ALTER TABLE staff ADD COLUMN IF NOT EXISTS opening_advance DECIMAL(12,2) DEFAULT 0;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS opening_loan DECIMAL(12,2) DEFAULT 0;

-- Payment method for staff advances (cash or bank)
ALTER TABLE staff_advances ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash';
