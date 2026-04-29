-- Section 7 (Lead Generation) spec gap closure.
-- Idempotent: safe to re-run.

ALTER TABLE "Lead"
  ADD COLUMN IF NOT EXISTS "industry"             TEXT,
  ADD COLUMN IF NOT EXISTS "openingHours"         JSONB,
  ADD COLUMN IF NOT EXISTS "assignedUserId"       TEXT,
  ADD COLUMN IF NOT EXISTS "crmStage"             TEXT,
  ADD COLUMN IF NOT EXISTS "digitalPresenceScore" INTEGER,
  ADD COLUMN IF NOT EXISTS "googlePlaceId"        TEXT,
  ADD COLUMN IF NOT EXISTS "yelpBusinessId"       TEXT;

-- Backfill convenience copies of provider IDs so dedup can match across orgs.
UPDATE "Lead"
SET "googlePlaceId" = "externalPlaceId"
WHERE "provider" = 'google_places' AND "googlePlaceId" IS NULL;

UPDATE "Lead"
SET "yelpBusinessId" = "externalPlaceId"
WHERE "provider" = 'yelp_fusion' AND "yelpBusinessId" IS NULL;

CREATE INDEX IF NOT EXISTS "Lead_orgId_assignedUserId_idx"
  ON "Lead" ("organizationId", "assignedUserId");
CREATE INDEX IF NOT EXISTS "Lead_orgId_crmStage_idx"
  ON "Lead" ("organizationId", "crmStage");
CREATE INDEX IF NOT EXISTS "Lead_orgId_googlePlaceId_idx"
  ON "Lead" ("organizationId", "googlePlaceId");
CREATE INDEX IF NOT EXISTS "Lead_orgId_yelpBusinessId_idx"
  ON "Lead" ("organizationId", "yelpBusinessId");
CREATE INDEX IF NOT EXISTS "Lead_orgId_emailNormalized_idx"
  ON "Lead" ("organizationId", "emailNormalized");

-- Merge history (audit trail of dedup decisions).
CREATE TABLE IF NOT EXISTS "LeadMergeHistory" (
  "id"              TEXT PRIMARY KEY,
  "organizationId"  TEXT NOT NULL,
  "canonicalLeadId" TEXT NOT NULL,
  "reason"          TEXT NOT NULL,
  "confidence"      DOUBLE PRECISION NOT NULL,
  "fromProvider"    TEXT,
  "fromExternalId"  TEXT,
  "payload"         JSONB,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadMergeHistory_canonical_fkey"
    FOREIGN KEY ("canonicalLeadId") REFERENCES "Lead"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "LeadMergeHistory_orgId_canonical_idx"
  ON "LeadMergeHistory" ("organizationId", "canonicalLeadId");
CREATE INDEX IF NOT EXISTS "LeadMergeHistory_canonical_createdAt_idx"
  ON "LeadMergeHistory" ("canonicalLeadId", "createdAt");

-- RLS: tenant scoping via organizationId column.
ALTER TABLE "LeadMergeHistory" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "LeadMergeHistory_tenant_isolation" ON "LeadMergeHistory";
CREATE POLICY "LeadMergeHistory_tenant_isolation"
  ON "LeadMergeHistory"
  USING ("organizationId" = current_org())
  WITH CHECK ("organizationId" = current_org());
