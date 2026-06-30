-- Add overtime and food allowance columns to salary_slips
ALTER TABLE salary_slips ADD COLUMN IF NOT EXISTS food_allowance DECIMAL(12,2) DEFAULT 0;
ALTER TABLE salary_slips ADD COLUMN IF NOT EXISTS normal_overtime DECIMAL(12,2) DEFAULT 0;
ALTER TABLE salary_slips ADD COLUMN IF NOT EXISTS friday_overtime DECIMAL(12,2) DEFAULT 0;
