-- Module #21 — Integrations hub
DO $$ BEGIN
  CREATE TYPE "IntegrationStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'ERROR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Integration" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "provider"       TEXT NOT NULL,
  "status"         "IntegrationStatus" NOT NULL DEFAULT 'DISCONNECTED',
  "accountLabel"   TEXT,
  "credentials"    JSONB,
  "config"         JSONB,
  "lastError"      TEXT,
  "lastSyncedAt"   TIMESTAMPTZ,
  "createdById"    UUID,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Integration_org_fkey" FOREIGN KEY ("organizationId")
    REFERENCES "Organization"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Integration_org_provider_key"
  ON "Integration"("organizationId", "provider");

CREATE INDEX IF NOT EXISTS "Integration_org_status_idx"
  ON "Integration"("organizationId", "status");

ALTER TABLE "Integration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Integration" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "tenant_isolation" ON "Integration"
    USING ("organizationId" = current_org())
    WITH CHECK ("organizationId" = current_org());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
