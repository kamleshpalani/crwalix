-- 0019_project_files.sql
-- Phase 3.5 — File attachments on projects (Supabase Storage).
--
-- Bytes live in Supabase Storage (single bucket per env). This table stores
-- metadata: storage path, filename, mime, size, SHA-256 hash, uploader.
-- Access is brokered via short-lived signed URLs from the web tier.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS "ProjectFile" (
  "id"             TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" TEXT NOT NULL,
  "projectId"      TEXT NOT NULL,
  "storagePath"    TEXT NOT NULL UNIQUE,
  "filename"       TEXT NOT NULL,
  "mimeType"       TEXT NOT NULL,
  "sizeBytes"      INT  NOT NULL,
  "contentHash"    TEXT,
  "uploadedById"   TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "ProjectFile_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "ProjectFile_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "ProjectFile_org_project_created_idx"
  ON "ProjectFile" ("organizationId", "projectId", "createdAt");

ALTER TABLE "ProjectFile" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ProjectFile_tenant_isolation" ON "ProjectFile";
CREATE POLICY "ProjectFile_tenant_isolation" ON "ProjectFile"
  USING ("organizationId" = current_org())
  WITH CHECK ("organizationId" = current_org());
