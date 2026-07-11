-- AMC Payments: track partial/advance payments against AMC contracts

CREATE TABLE amc_payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  amc_contract_id  UUID NOT NULL REFERENCES amc_contracts(id) ON DELETE CASCADE,
  payment_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  amount           DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  payment_mode     payment_mode NOT NULL DEFAULT 'cash',
  reference_number TEXT,
  notes            TEXT,
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE amc_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "amc_payments_org_select" ON amc_payments FOR SELECT
  USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

CREATE POLICY "amc_payments_org_insert" ON amc_payments FOR INSERT
  WITH CHECK (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

CREATE POLICY "amc_payments_org_delete" ON amc_payments FOR DELETE
  USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

-- Index for fast lookups by contract
CREATE INDEX amc_payments_contract_idx ON amc_payments (amc_contract_id);
CREATE INDEX amc_payments_date_idx ON amc_payments (payment_date);

-- Grant access to roles (required for Supabase migrations)
GRANT SELECT, INSERT, DELETE ON amc_payments TO authenticated;
GRANT ALL ON amc_payments TO service_role;
