-- 0020_client_portal.sql
-- Phase 3.3 — Client portal access + magic-link tokens.
--
-- PortalAccess: persistent grant for an external email to view a Project.
-- PortalLoginToken: one-shot, SHA-256-hashed magic link tokens.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS "PortalAccess" (
  "id"             TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" TEXT NOT NULL,
  "projectId"      TEXT NOT NULL,
  "email"          TEXT NOT NULL,
  "name"           TEXT,
  "status"         TEXT NOT NULL DEFAULT 'PENDING',
  "invitedById"    TEXT NOT NULL,
  "invitedAt"      TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "lastLoginAt"    TIMESTAMP(3),
  "revokedAt"      TIMESTAMP(3),
  CONSTRAINT "PortalAccess_projectId_email_key" UNIQUE ("projectId", "email")
);

CREATE INDEX IF NOT EXISTS "PortalAccess_org_project_idx"
  ON "PortalAccess" ("organizationId", "projectId");
CREATE INDEX IF NOT EXISTS "PortalAccess_email_idx"
  ON "PortalAccess" ("email");

ALTER TABLE "PortalAccess" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "PortalAccess_tenant_isolation" ON "PortalAccess";
CREATE POLICY "PortalAccess_tenant_isolation" ON "PortalAccess"
  USING ("organizationId" = current_org())
  WITH CHECK ("organizationId" = current_org());

CREATE TABLE IF NOT EXISTS "PortalLoginToken" (
  "id"             TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" TEXT NOT NULL,
  "portalAccessId" TEXT NOT NULL,
  "tokenHash"      TEXT NOT NULL UNIQUE,
  "expiresAt"      TIMESTAMP(3) NOT NULL,
  "consumedAt"     TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "PortalLoginToken_portalAccessId_fkey"
    FOREIGN KEY ("portalAccessId") REFERENCES "PortalAccess"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "PortalLoginToken_portal_idx"
  ON "PortalLoginToken" ("portalAccessId");
CREATE INDEX IF NOT EXISTS "PortalLoginToken_expires_idx"
  ON "PortalLoginToken" ("expiresAt");

-- Note: PortalLoginToken is intentionally NOT under RLS — tokens are
-- looked up by tokenHash before we know the org. The query is itself
-- the authorization (knowing the hash == knowing the secret).
