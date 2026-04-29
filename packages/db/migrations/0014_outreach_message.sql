-- 0014_outreach_message.sql
-- Phase 1.5: Outreach package — per-send tracking row.
-- Adds `OutreachMessage` for outbound email audit, open/click/bounce/reply
-- tracking, suppression dispatch checks, and Phase 1.6 sequence joins.
--
-- Apply via: psql $DIRECT_URL -f packages/db/migrations/0014_outreach_message.sql
-- Or paste into the Supabase SQL editor.
--
-- Idempotent: safe to re-run.

begin;

-- -------- OutreachMessage table ----------------------------------------------
create table if not exists "OutreachMessage" (
  id              text primary key,
  "organizationId" text not null,
  "leadId"        text,
  "dealId"        text,
  "sequenceRunId" text,
  "toEmail"       text not null,
  "fromEmail"     text not null,
  subject         text not null,
  "bodyHtml"      text not null,
  "bodyText"      text,
  "providerId"    text,
  provider        text,
  status          text not null default 'QUEUED',
  "errorMessage"  text,
  "sentAt"        timestamp(3),
  "deliveredAt"   timestamp(3),
  "openedAt"      timestamp(3),
  "clickedAt"     timestamp(3),
  "repliedAt"     timestamp(3),
  "bouncedAt"     timestamp(3),
  "unsubscribedAt" timestamp(3),
  "createdAt"     timestamp(3) not null default now(),
  "updatedAt"     timestamp(3) not null default now()
);

create index if not exists "OutreachMessage_org_status_created_idx"
  on "OutreachMessage"("organizationId", status, "createdAt");
create index if not exists "OutreachMessage_org_lead_created_idx"
  on "OutreachMessage"("organizationId", "leadId", "createdAt");
create index if not exists "OutreachMessage_org_deal_created_idx"
  on "OutreachMessage"("organizationId", "dealId", "createdAt");
create index if not exists "OutreachMessage_provider_id_idx"
  on "OutreachMessage"("providerId");

-- -------- Foreign keys --------------------------------------------------------
alter table "OutreachMessage"
  drop constraint if exists outreach_message_org_fk,
  add  constraint outreach_message_org_fk
    foreign key ("organizationId") references "Organization"(id) on delete cascade;

alter table "OutreachMessage"
  drop constraint if exists outreach_message_lead_fk,
  add  constraint outreach_message_lead_fk
    foreign key ("leadId") references "Lead"(id) on delete set null;

alter table "OutreachMessage"
  drop constraint if exists outreach_message_deal_fk,
  add  constraint outreach_message_deal_fk
    foreign key ("dealId") references "Deal"(id) on delete set null;

-- -------- Row-level security --------------------------------------------------
alter table "OutreachMessage" enable row level security;

drop policy if exists tenant_isolation on public."OutreachMessage";
create policy tenant_isolation on public."OutreachMessage"
  using ("organizationId" = public.current_org())
  with check ("organizationId" = public.current_org());

commit;
