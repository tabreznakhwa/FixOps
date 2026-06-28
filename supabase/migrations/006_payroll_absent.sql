-- Allow naming the allowance (e.g. "Fuel Allowance", "Site Allowance")
ALTER TABLE staff ADD COLUMN IF NOT EXISTS allowance_name TEXT DEFAULT 'Allowance';

-- Absent day tracking on payslips
ALTER TABLE salary_slips ADD COLUMN IF NOT EXISTS absent_days INTEGER DEFAULT 0;
ALTER TABLE salary_slips ADD COLUMN IF NOT EXISTS absent_deduction DECIMAL(12,2) DEFAULT 0;
ALTER TABLE salary_slips ADD COLUMN IF NOT EXISTS food_deduction DECIMAL(12,2) DEFAULT 0;
ALTER TABLE salary_slips ADD COLUMN IF NOT EXISTS allowance_name TEXT DEFAULT 'Allowance';
