-- Make audit_logs match what the application actually writes.
--
-- The table was created in 001 with module_name / table_name / record_id /
-- old_value / new_value, but logAudit() writes user_name / entity_type /
-- entity_id / entity_label / changes and never sets module_name, which is
-- NOT NULL. Every audit insert therefore failed the NOT NULL constraint —
-- and logAudit swallows errors by design ("audit logging must never break the
-- main operation"), so nothing surfaced. The Audit Trail page reads the same
-- columns the code writes, which is why it shows no events at all.
--
-- Adds the missing columns and relaxes module_name so writes succeed.
-- Historical events cannot be recovered; they were never stored.

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_name    TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_type  TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_id    UUID;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_label TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS changes      JSONB;

-- Not supplied by the application; keep the column for any legacy rows.
ALTER TABLE audit_logs ALTER COLUMN module_name DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created
  ON audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON audit_logs(entity_type, entity_id);

-- logAudit uses the admin client, so service_role must be able to insert.
GRANT SELECT, INSERT ON audit_logs TO service_role;
GRANT SELECT ON audit_logs TO authenticated;
