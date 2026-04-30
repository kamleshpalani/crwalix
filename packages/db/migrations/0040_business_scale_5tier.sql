-- §11 — Backfill businessScale for rows that still carry the old 3-tier values
-- (SME → SMALL, MID_MARKET → MEDIUM).  The LARGE value maps 1-to-1 and needs
-- no change.  UNKNOWN is unchanged.  This migration is idempotent and safe to
-- re-run.

UPDATE "Lead"
SET "businessScale" = 'SMALL'
WHERE "businessScale" = 'SME';

UPDATE "Lead"
SET "businessScale" = 'MEDIUM'
WHERE "businessScale" = 'MID_MARKET';
