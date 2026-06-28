-- Add print_name to invoices so the Bill To name can be overridden per-invoice
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS print_name TEXT;
