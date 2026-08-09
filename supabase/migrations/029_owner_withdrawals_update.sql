-- Allow editing an owner withdrawal.
--
-- owner_withdrawals was created with select/insert/delete only — no UPDATE
-- grant and no UPDATE policy — so correcting a wrong amount or date was
-- impossible and the Edit button failed with
-- "permission denied for table owner_withdrawals".
--
-- Both statements are required: with RLS enabled a GRANT alone is not enough,
-- the row still needs a policy permitting the UPDATE.

GRANT UPDATE ON owner_withdrawals TO authenticated;

DROP POLICY IF EXISTS "ow_update" ON owner_withdrawals;

-- USING controls which rows may be updated; WITH CHECK stops a row being moved
-- into another organization by the update itself.
CREATE POLICY "ow_update" ON owner_withdrawals
  FOR UPDATE
  USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));
