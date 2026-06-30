ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS supplier_invoice_number TEXT;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(12,3) DEFAULT 0;
