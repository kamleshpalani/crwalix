-- Migration 0036: Lead Enrichment Module (§8.1 + §8.2)
--
-- Adds:
--   • New EnrichmentKind values: BUSINESS_DESCRIPTION, REVIEW_SUMMARY
--   • New EnrichmentStatus value: PARTIAL
--   • New Lead columns for the 12 enrichment data points:
--       businessDescription, reviewSummary, techStack, seoTitle,
--       seoDescription, isMobileReady, hasContactForm, enrichmentStatus

-- §8.1 EnrichmentKind additions
ALTER TYPE "EnrichmentKind" ADD VALUE IF NOT EXISTS 'BUSINESS_DESCRIPTION';
ALTER TYPE "EnrichmentKind" ADD VALUE IF NOT EXISTS 'REVIEW_SUMMARY';

-- §8.2 EnrichmentStatus: PARTIAL (some kinds succeeded, others failed/skipped)
ALTER TYPE "EnrichmentStatus" ADD VALUE IF NOT EXISTS 'PARTIAL';

-- §8.1 Lead data-point columns
ALTER TABLE "Lead"
  ADD COLUMN IF NOT EXISTS "businessDescription" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewSummary"       TEXT,
  ADD COLUMN IF NOT EXISTS "techStack"           TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "seoTitle"            TEXT,
  ADD COLUMN IF NOT EXISTS "seoDescription"      TEXT,
  ADD COLUMN IF NOT EXISTS "isMobileReady"       BOOLEAN,
  ADD COLUMN IF NOT EXISTS "hasContactForm"      BOOLEAN,
  -- §8.2 aggregate enrichment status per lead
  ADD COLUMN IF NOT EXISTS "enrichmentStatus"    TEXT    NOT NULL DEFAULT 'NOT_STARTED';

-- Index so the UI can filter leads by aggregate enrichment status
CREATE INDEX IF NOT EXISTS "Lead_organizationId_enrichmentStatus_idx"
  ON "Lead" ("organizationId", "enrichmentStatus");
