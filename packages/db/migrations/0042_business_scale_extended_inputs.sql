-- §11 — Add extended classification-input columns to Lead.
-- These fields feed classifyBusinessScale() and allow richer tier accuracy
-- when publicly available company data (locations, revenue, headcount) is known.

ALTER TABLE "Lead"
  ADD COLUMN IF NOT EXISTS "locationCount"         INT,
  ADD COLUMN IF NOT EXISTS "revenueEstimate"        TEXT,
  ADD COLUMN IF NOT EXISTS "employeeEstimate"       INT,
  ADD COLUMN IF NOT EXISTS "linkedinEmployeeRange"  TEXT;

COMMENT ON COLUMN "Lead"."locationCount"
  IS '§11 — Number of physical locations / branches observed for this business.';

COMMENT ON COLUMN "Lead"."revenueEstimate"
  IS '§11 — Publicly available revenue band string, e.g. "$1M–$10M". Legal sources only.';

COMMENT ON COLUMN "Lead"."employeeEstimate"
  IS '§11 — Estimated employee headcount from public sources (e.g. LinkedIn, Companies House).';

COMMENT ON COLUMN "Lead"."linkedinEmployeeRange"
  IS '§11 — LinkedIn employee-count band string, e.g. "11-50" or "1001-5000".';
