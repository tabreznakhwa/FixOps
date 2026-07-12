-- Fund Transfers: cash ↔ bank internal transfers
CREATE TABLE fund_transfers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  transfer_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  from_account     TEXT NOT NULL CHECK (from_account IN ('cash', 'bank')),
  to_account       TEXT NOT NULL CHECK (to_account IN ('cash', 'bank')),
  amount           DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  reference_number TEXT,
  notes            TEXT,
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT different_accounts CHECK (from_account != to_account)
);

ALTER TABLE fund_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ft_select" ON fund_transfers FOR SELECT USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));
CREATE POLICY "ft_insert" ON fund_transfers FOR INSERT WITH CHECK (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));
CREATE POLICY "ft_delete" ON fund_transfers FOR DELETE USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));
GRANT SELECT, INSERT, DELETE ON fund_transfers TO authenticated;
GRANT ALL ON fund_transfers TO service_role;
CREATE INDEX fund_transfers_org_idx ON fund_transfers (organization_id);
CREATE INDEX fund_transfers_date_idx ON fund_transfers (transfer_date);

-- Owner Withdrawals: owner drawing funds outside of salary
CREATE TABLE owner_withdrawals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  withdrawal_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  amount           DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  payment_mode     TEXT NOT NULL DEFAULT 'cash' CHECK (payment_mode IN ('cash', 'bank_transfer', 'cheque', 'pos', 'card', 'online')),
  purpose          TEXT,
  notes            TEXT,
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE owner_withdrawals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ow_select" ON owner_withdrawals FOR SELECT USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));
CREATE POLICY "ow_insert" ON owner_withdrawals FOR INSERT WITH CHECK (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));
CREATE POLICY "ow_delete" ON owner_withdrawals FOR DELETE USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));
GRANT SELECT, INSERT, DELETE ON owner_withdrawals TO authenticated;
GRANT ALL ON owner_withdrawals TO service_role;
CREATE INDEX owner_withdrawals_org_idx ON owner_withdrawals (organization_id);
CREATE INDEX owner_withdrawals_date_idx ON owner_withdrawals (withdrawal_date);
