-- Allow assigning staff members (who don't have system logins) to work orders and complaints
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS technician_name TEXT;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS assigned_staff_id UUID REFERENCES staff(id);
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS technician_name TEXT;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS assigned_staff_id UUID REFERENCES staff(id);
