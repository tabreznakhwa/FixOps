-- Fix missing GRANT for authenticated role on tables created before the explicit-grant pattern was established
GRANT SELECT, INSERT, UPDATE, DELETE ON technician_locations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON attendance TO authenticated;
