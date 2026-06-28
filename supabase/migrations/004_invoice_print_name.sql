-- Move print_name from invoices to customers (customer-level permanent setting)
ALTER TABLE invoices DROP COLUMN IF EXISTS print_name;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS print_name TEXT;
