-- Migration 0009: Project edit audit log.
-- Mirror of SearchEdit (migration 0008). One row per save with a JSON diff.

CREATE TABLE IF NOT EXISTS "ProjectEdit" (
  "id"             TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "projectId"      TEXT NOT NULL,
  "editedById"     TEXT,
  "diff"           JSONB NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ProjectEdit_orgId_projectId_createdAt_idx"
  ON "ProjectEdit" ("organizationId", "projectId", "createdAt");

ALTER TABLE "ProjectEdit" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ProjectEdit_tenant_isolation" ON "ProjectEdit";
CREATE POLICY "ProjectEdit_tenant_isolation" ON "ProjectEdit"
  USING ("organizationId" = current_setting('app.current_org', true)::text);
