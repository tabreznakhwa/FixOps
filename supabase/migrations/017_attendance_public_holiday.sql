-- Add public holiday flag to attendance records
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS is_public_holiday BOOLEAN NOT NULL DEFAULT false;
