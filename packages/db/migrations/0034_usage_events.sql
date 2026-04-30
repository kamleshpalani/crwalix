-- 0034_usage_events.sql
-- Phase 2.7 — Usage metering.
-- One row per billable event (AI tokens, emails sent, leads enriched/discovered).
-- Aggregated nightly for Stripe metered billing and per-org cost dashboards.

CREATE TABLE IF NOT EXISTS "UsageEvent" (
  "id"             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" TEXT         NOT NULL,
  "kind"           TEXT         NOT NULL,
  "quantity"       INTEGER      NOT NULL DEFAULT 1,
  "costMicroCents" INTEGER      NOT NULL DEFAULT 0,
  "refId"          TEXT,
  "meta"           JSONB,
  "createdAt"      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "UsageEvent_orgId_kind_createdAt"
  ON "UsageEvent" ("organizationId", "kind", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "UsageEvent_orgId_createdAt"
  ON "UsageEvent" ("organizationId", "createdAt" DESC);

-- RLS: each org sees only its own rows.
ALTER TABLE "UsageEvent" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "UsageEvent_org_isolation"
  ON "UsageEvent"
  USING ("organizationId" = current_setting('app.current_org_id', true));
