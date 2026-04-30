-- Section 7.2 / 7.4: pending-merge review flow.
-- Adds review state to LeadMergeHistory so low-confidence dedupe hits
-- can be flagged for human approval instead of auto-merging.
-- Idempotent: safe to re-run.

ALTER TABLE "LeadMergeHistory"
  ADD COLUMN IF NOT EXISTS "status"        TEXT NOT NULL DEFAULT 'auto_merged',
  ADD COLUMN IF NOT EXISTS "pendingLeadId" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedBy"    TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedAt"    TIMESTAMP(3);

-- Backfill: existing rows are historical auto-merges.
UPDATE "LeadMergeHistory"
SET "status" = 'auto_merged'
WHERE "status" IS NULL;

-- FK on pendingLeadId so deleting either lead clears the row.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LeadMergeHistory_pending_fkey'
  ) THEN
    ALTER TABLE "LeadMergeHistory"
      ADD CONSTRAINT "LeadMergeHistory_pending_fkey"
      FOREIGN KEY ("pendingLeadId") REFERENCES "Lead"("id") ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "LeadMergeHistory_orgId_status_idx"
  ON "LeadMergeHistory" ("organizationId", "status");
CREATE INDEX IF NOT EXISTS "LeadMergeHistory_pendingLeadId_idx"
  ON "LeadMergeHistory" ("pendingLeadId");
