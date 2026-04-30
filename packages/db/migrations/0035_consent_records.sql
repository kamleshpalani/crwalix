-- 0035_consent_records.sql
-- Phase 5.2 — GDPR/CCPA consent audit log.
-- Append-only log of ToS/Privacy/Marketing acceptance per user+org pair.
-- Records are never updated; revocation is a new row with accepted=false.

CREATE TABLE IF NOT EXISTS "ConsentRecord" (
  "id"             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" TEXT         NOT NULL,
  "userId"         TEXT         NOT NULL,
  "kind"           TEXT         NOT NULL,
  "policyVersion"  TEXT         NOT NULL,
  "accepted"       BOOLEAN      NOT NULL DEFAULT true,
  "ip"             TEXT,
  "userAgent"      TEXT,
  "createdAt"      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ConsentRecord_orgId_userId_kind_createdAt"
  ON "ConsentRecord" ("organizationId", "userId", "kind", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "ConsentRecord_orgId_userId"
  ON "ConsentRecord" ("organizationId", "userId");

-- RLS: each org sees only its own consent records.
ALTER TABLE "ConsentRecord" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ConsentRecord_org_isolation"
  ON "ConsentRecord"
  USING ("organizationId" = current_setting('app.current_org_id', true));
