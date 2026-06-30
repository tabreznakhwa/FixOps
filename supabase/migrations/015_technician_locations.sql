-- Location captured at clock-in/out
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_in_lat DECIMAL(10,7);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_in_lng DECIMAL(10,7);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_out_lat DECIMAL(10,7);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_out_lng DECIMAL(10,7);

-- Latest known position per technician, refreshed by periodic pings while
-- the My Jobs page is open and the technician is clocked in
CREATE TABLE IF NOT EXISTS technician_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL UNIQUE REFERENCES staff(id) ON DELETE CASCADE,
  lat DECIMAL(10,7) NOT NULL,
  lng DECIMAL(10,7) NOT NULL,
  accuracy DECIMAL(8,2),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_technician_locations_org ON technician_locations(organization_id);

ALTER TABLE technician_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "technician_locations_org" ON technician_locations
  FOR ALL USING (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.technician_locations TO service_role;
