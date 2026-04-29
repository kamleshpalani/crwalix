-- Section 6.1 / 6.2 — User and Organization profile fields + status/billing

DO $$ BEGIN
  CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING', 'DELETED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "OrgStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING', 'DELETED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BillingStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'NONE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "firstName"    TEXT,
  ADD COLUMN IF NOT EXISTS "lastName"     TEXT,
  ADD COLUMN IF NOT EXISTS "phone"        TEXT,
  ADD COLUMN IF NOT EXISTS "status"       "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "lastLoginAt"  TIMESTAMPTZ;

ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "status"          "OrgStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "billingStatus"   "BillingStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "companyEmail"    TEXT,
  ADD COLUMN IF NOT EXISTS "companyPhone"    TEXT,
  ADD COLUMN IF NOT EXISTS "website"         TEXT,
  ADD COLUMN IF NOT EXISTS "addressLine1"    TEXT,
  ADD COLUMN IF NOT EXISTS "addressLine2"    TEXT,
  ADD COLUMN IF NOT EXISTS "city"            TEXT,
  ADD COLUMN IF NOT EXISTS "state"           TEXT,
  ADD COLUMN IF NOT EXISTS "postalCode"      TEXT,
  ADD COLUMN IF NOT EXISTS "country"         TEXT,
  ADD COLUMN IF NOT EXISTS "aiUsageLimit"    INTEGER,
  ADD COLUMN IF NOT EXISTS "leadSearchLimit" INTEGER;

CREATE INDEX IF NOT EXISTS "User_status_idx" ON "User"("status");
CREATE INDEX IF NOT EXISTS "Organization_status_idx" ON "Organization"("status");
CREATE INDEX IF NOT EXISTS "User_isSuperAdmin_idx" ON "User"("isSuperAdmin") WHERE "isSuperAdmin" = true;
