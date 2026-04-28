-- Migration 0008: Search edit audit log.
-- One row per save with a JSON diff of changed fields.

CREATE TABLE IF NOT EXISTS "SearchEdit" (
  "id"             TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "searchId"       TEXT NOT NULL,
  "editedById"     TEXT,
  "diff"           JSONB NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "SearchEdit_orgId_searchId_createdAt_idx"
  ON "SearchEdit" ("organizationId", "searchId", "createdAt");

ALTER TABLE "SearchEdit" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SearchEdit_tenant_isolation" ON "SearchEdit";
CREATE POLICY "SearchEdit_tenant_isolation" ON "SearchEdit"
  USING ("organizationId" = current_setting('app.current_org', true)::text);
