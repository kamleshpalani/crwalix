-- 0030_lead_field_history.sql
-- Lead field-level change tracking (Section 7.3 — field version history).
-- Records each field update on a Lead row so users can see what changed,
-- when, and who changed it.  Replaces the previous "no changelog" gap.

CREATE TABLE IF NOT EXISTS "LeadFieldHistory" (
  "id"             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" UUID        NOT NULL,
  "leadId"         UUID        NOT NULL,
  "field"          TEXT        NOT NULL,
  "oldValue"       TEXT,
  "newValue"       TEXT,
  "changedBy"      UUID,
  "source"         TEXT        NOT NULL DEFAULT 'user',  -- 'user' | 'enrichment' | 'import' | 'webhook' | 'system'
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "LeadFieldHistory_lead_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "LeadFieldHistory_lead_idx"
  ON "LeadFieldHistory" ("leadId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "LeadFieldHistory_org_idx"
  ON "LeadFieldHistory" ("organizationId", "createdAt" DESC);

ALTER TABLE "LeadFieldHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeadFieldHistory" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "tenant_isolation" ON "LeadFieldHistory"
    USING ("organizationId" = current_org())
    WITH CHECK ("organizationId" = current_org());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
