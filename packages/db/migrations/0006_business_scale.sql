-- Lead business-scale classification (SME / MID_MARKET / LARGE / UNKNOWN).
-- Populated by the worker on ingest and refreshed after website audits.

ALTER TABLE "Lead"
  ADD COLUMN IF NOT EXISTS "businessScale" TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS "businessScaleConfidence" INTEGER,
  ADD COLUMN IF NOT EXISTS "businessScaleSignals" JSONB;

CREATE INDEX IF NOT EXISTS "Lead_org_businessScale_idx"
  ON "Lead" ("organizationId", "businessScale");
