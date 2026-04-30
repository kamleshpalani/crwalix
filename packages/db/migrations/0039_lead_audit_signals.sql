-- §9.2 — Add boolean audit-signal columns to the Lead table.
-- These are populated by the website enrichment pipeline and consumed by
-- AI scoring (scoreLeadWithAi) and the lead-scoring engine.

ALTER TABLE "Lead"
  ADD COLUMN IF NOT EXISTS "hasSeoBasics"       BOOLEAN,
  ADD COLUMN IF NOT EXISTS "hasSchemaMarkup"     BOOLEAN,
  ADD COLUMN IF NOT EXISTS "hasAnalytics"        BOOLEAN,
  ADD COLUMN IF NOT EXISTS "hasBookingForm"      BOOLEAN,
  ADD COLUMN IF NOT EXISTS "hasLeadCaptureForm"  BOOLEAN;
