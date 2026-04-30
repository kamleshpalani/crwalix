-- 0032_org_require_mfa.sql
-- Per-org MFA enforcement (Spec 6.1 — "Multi-factor authentication as an optional setting").
-- When requireMfa = TRUE, all members of that org must have completed a second factor
-- before accessing tenant-scoped resources.  The application layer checks this flag
-- in requireOrg() and rejects sessions that lack a Clerk-verified second factor.

ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "requireMfa" BOOLEAN NOT NULL DEFAULT false;
