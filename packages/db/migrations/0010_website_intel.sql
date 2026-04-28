-- Migration 0010: Website Intelligence & Competitor Analysis.
-- Two tables: WebsiteIntelReport (1 per analysis) and WebsiteIntelCompetitor
-- (N per report). Both tenant-scoped + RLS.

CREATE TABLE IF NOT EXISTS "WebsiteIntelReport" (
  "id"             TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "leadId"         TEXT,
  "title"          TEXT NOT NULL,
  "primaryUrl"     TEXT NOT NULL,
  "category"       TEXT,
  "city"           TEXT,
  "country"        TEXT,
  "status"         TEXT NOT NULL DEFAULT 'queued',
  "errorMessage"   TEXT,
  "summaryJson"    JSONB,
  "createdById"    TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "WebsiteIntelReport_orgId_createdAt_idx"
  ON "WebsiteIntelReport" ("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "WebsiteIntelReport_orgId_leadId_idx"
  ON "WebsiteIntelReport" ("organizationId", "leadId");

ALTER TABLE "WebsiteIntelReport" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "WebsiteIntelReport_tenant_isolation" ON "WebsiteIntelReport";
CREATE POLICY "WebsiteIntelReport_tenant_isolation" ON "WebsiteIntelReport"
  USING ("organizationId" = current_setting('app.current_org', true)::text);

CREATE TABLE IF NOT EXISTS "WebsiteIntelCompetitor" (
  "id"             TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "reportId"       TEXT NOT NULL REFERENCES "WebsiteIntelReport"("id") ON DELETE CASCADE,
  "source"         TEXT NOT NULL DEFAULT 'manual',
  "name"           TEXT,
  "url"            TEXT NOT NULL,
  "auditJson"      JSONB,
  "status"         TEXT NOT NULL DEFAULT 'queued',
  "errorMessage"   TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "WebsiteIntelCompetitor_orgId_reportId_idx"
  ON "WebsiteIntelCompetitor" ("organizationId", "reportId");

ALTER TABLE "WebsiteIntelCompetitor" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "WebsiteIntelCompetitor_tenant_isolation" ON "WebsiteIntelCompetitor";
CREATE POLICY "WebsiteIntelCompetitor_tenant_isolation" ON "WebsiteIntelCompetitor"
  USING ("organizationId" = current_setting('app.current_org', true)::text);
