-- Lead lifecycle redesign + contact-channel + service-pitch fields.
-- Adds new enum values to LeadStatus and new columns on Lead. The legacy
-- enum values are retained so existing rows remain valid; the UI only
-- exposes the new canonical lifecycle.

ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'VERIFIED';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'CONTACTED';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'INTERESTED';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'FOLLOW_UP';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'NOT_INTERESTED';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'CONVERTED';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'CLOSED';

ALTER TABLE "Lead"
  ADD COLUMN IF NOT EXISTS "email"            TEXT,
  ADD COLUMN IF NOT EXISTS "emailNormalized"  TEXT,
  ADD COLUMN IF NOT EXISTS "ownerName"        TEXT,
  ADD COLUMN IF NOT EXISTS "facebookUrl"      TEXT,
  ADD COLUMN IF NOT EXISTS "instagramUrl"     TEXT,
  ADD COLUMN IF NOT EXISTS "googleProfileUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "servicePitch"     TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

CREATE INDEX IF NOT EXISTS "Lead_org_emailNormalized_idx"
  ON "Lead" ("organizationId", "emailNormalized");
