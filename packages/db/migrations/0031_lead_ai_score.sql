-- 0031_lead_ai_score.sql
-- AI/ML lead scoring fields (Section 7.4).
-- Stores the AI-assigned score and reasoning alongside the existing rule-based score.

ALTER TABLE "Lead"
  ADD COLUMN IF NOT EXISTS "aiScore"       INTEGER,
  ADD COLUMN IF NOT EXISTS "aiScoreTier"   TEXT,
  ADD COLUMN IF NOT EXISTS "aiScoreReason" TEXT,
  ADD COLUMN IF NOT EXISTS "aiScoredAt"    TIMESTAMPTZ;

-- Optional index for sorting leads by AI score
CREATE INDEX IF NOT EXISTS "Lead_aiScore_idx"
  ON "Lead" ("organizationId", "aiScore" DESC NULLS LAST);
