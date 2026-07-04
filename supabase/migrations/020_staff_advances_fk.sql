-- Register FK from staff_advances to staff so PostgREST can resolve staff(full_name) joins
-- (staff_advances was created manually without this FK, breaking cash/bank book join queries)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'staff_advances_staff_id_fkey'
  ) THEN
    ALTER TABLE staff_advances
      ADD CONSTRAINT staff_advances_staff_id_fkey
      FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE;
  END IF;
END $$;
