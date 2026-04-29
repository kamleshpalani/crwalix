-- 0018_milestones.sql
-- Phase 3.1 — Billable milestones for projects.
--
-- Adds the `Milestone` table with RLS for tenant isolation. Milestones are
-- billable checkpoints within a Project; setting `autoInvoice=true` causes
-- the worker to auto-create a Stripe Invoice when the milestone is marked
-- COMPLETED. The `invoiceId` link enforces idempotency.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS "Milestone" (
  "id"             TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" TEXT NOT NULL,
  "projectId"      TEXT NOT NULL,
  "title"          TEXT NOT NULL,
  "description"    TEXT,
  "status"         TEXT NOT NULL DEFAULT 'PENDING',
  "position"       INT  NOT NULL DEFAULT 0,
  "amountCents"    INT  NOT NULL DEFAULT 0,
  "currency"       TEXT NOT NULL DEFAULT 'USD',
  "autoInvoice"    BOOLEAN NOT NULL DEFAULT false,
  "invoiceId"      TEXT UNIQUE,
  "dueAt"          TIMESTAMP(3),
  "completedAt"    TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "Milestone_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "Milestone_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE,
  CONSTRAINT "Milestone_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "Milestone_org_project_position_idx"
  ON "Milestone" ("organizationId", "projectId", "position");
CREATE INDEX IF NOT EXISTS "Milestone_org_status_idx"
  ON "Milestone" ("organizationId", "status");

-- RLS
ALTER TABLE "Milestone" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Milestone_tenant_isolation" ON "Milestone";
CREATE POLICY "Milestone_tenant_isolation" ON "Milestone"
  USING ("organizationId" = current_org())
  WITH CHECK ("organizationId" = current_org());
