-- Add nationality and visa_number columns to staff table
ALTER TABLE staff ADD COLUMN IF NOT EXISTS nationality TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS visa_number TEXT;
