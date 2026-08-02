-- Stored AI business analyses so owners can re-read and compare past reviews
-- without paying for a fresh generation each time.

CREATE TABLE IF NOT EXISTS ai_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  -- Narrative returned by the model (markdown)
  analysis TEXT NOT NULL,
  -- Snapshot of the metrics the analysis was based on, so a stored report can
  -- always be read against the numbers that produced it.
  metrics JSONB NOT NULL,
  model TEXT,
  generated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_insights_org ON ai_insights(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_insights_created ON ai_insights(created_at DESC);

ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_insights_org" ON ai_insights
  FOR ALL USING (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_insights TO service_role;
