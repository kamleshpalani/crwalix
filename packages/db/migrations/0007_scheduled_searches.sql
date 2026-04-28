-- 0007_scheduled_searches.sql
-- Adds:
--  • Recurring schedule fields on Search (scheduleFrequency, nextRunAt, lastRunAt)
--  • In-app Notification table
--  • Webhook + notification email columns on Organization

ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "notificationWebhookUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "notificationEmail"      TEXT;

ALTER TABLE "Search"
  ADD COLUMN IF NOT EXISTS "scheduleFrequency" TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "nextRunAt"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastRunAt"         TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Search_scheduleFrequency_nextRunAt_idx"
  ON "Search" ("scheduleFrequency", "nextRunAt");

CREATE TABLE IF NOT EXISTS "Notification" (
  "id"             TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "kind"           TEXT NOT NULL,
  "title"          TEXT NOT NULL,
  "body"           TEXT NOT NULL,
  "href"           TEXT,
  "data"           JSONB,
  "readAt"         TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Notification_org_unread_created_idx"
  ON "Notification" ("organizationId", "readAt", "createdAt");

CREATE INDEX IF NOT EXISTS "Notification_org_kind_created_idx"
  ON "Notification" ("organizationId", "kind", "createdAt");

-- RLS
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Notification_org_isolation" ON "Notification";
CREATE POLICY "Notification_org_isolation" ON "Notification"
  USING ("organizationId" = current_setting('app.organization_id', true)::text);
