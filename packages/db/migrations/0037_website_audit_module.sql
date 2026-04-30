-- Migration 0037: §9 Website Audit Module
-- Adds websiteClassification and websiteAiReport columns to Lead,
-- plus an index for fast filtering by classification.

-- §9.1 — 7-state website classification (stored as text)
ALTER TABLE "Lead"
  ADD COLUMN IF NOT EXISTS "websiteClassification" TEXT NOT NULL DEFAULT 'NO_WEBSITE';

-- §9.3 — AI-generated website audit report (structured JSON)
ALTER TABLE "Lead"
  ADD COLUMN IF NOT EXISTS "websiteAiReport" JSONB;

-- Index to support filtering/sorting leads by their classification
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Lead_organizationId_websiteClassification_idx"
  ON "Lead" ("organizationId", "websiteClassification");
