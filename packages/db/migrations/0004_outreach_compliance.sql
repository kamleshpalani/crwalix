-- Outreach compliance settings (CAN-SPAM + GDPR Art. 14)
CREATE TABLE IF NOT EXISTS "OutreachSettings" (
  "id"                  TEXT PRIMARY KEY,
  "organizationId"      TEXT NOT NULL UNIQUE REFERENCES "Organization"("id") ON DELETE CASCADE,
  "senderName"          TEXT,
  "senderCompany"       TEXT,
  "senderEmail"         TEXT,
  "replyToEmail"        TEXT,
  "mailingAddress"      TEXT,
  "unsubscribeUrl"      TEXT,
  "citeProviderInBody"  BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Outreach suppression list (post-unsubscribe / bounces / complaints).
-- Email is hashed (SHA-256 hex) so a leak does not expose a raw PII corpus.
CREATE TABLE IF NOT EXISTS "OutreachSuppression" (
  "id"             TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "emailHash"      TEXT NOT NULL,
  "reason"         TEXT NOT NULL DEFAULT 'UNSUBSCRIBE',
  "source"         TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutreachSuppression_org_emailHash_unique" UNIQUE ("organizationId", "emailHash")
);

CREATE INDEX IF NOT EXISTS "OutreachSuppression_org_createdAt_idx"
  ON "OutreachSuppression" ("organizationId", "createdAt");
