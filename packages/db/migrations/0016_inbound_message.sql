-- 0016_inbound_message.sql
-- Phase 1.7: Inbound reply receiver.
-- Adds `InboundMessage` for replies captured from Resend (or compatible)
-- inbound webhooks. Matched back to OutreachMessage via Message-ID /
-- In-Reply-To headers, then handed off to the AI reply classifier.
--
-- Apply via: psql $DIRECT_URL -f packages/db/migrations/0016_inbound_message.sql
-- Or paste into the Supabase SQL editor.
--
-- Idempotent: safe to re-run.

begin;

create table if not exists "InboundMessage" (
  id                       text primary key,
  "organizationId"         text not null,
  "outreachMessageId"      text,
  "sequenceRunId"          text,
  "leadId"                 text,
  "dealId"                 text,
  "fromEmail"              text not null,
  "fromName"               text,
  "toEmail"                text not null,
  subject                  text not null,
  "providerMessageId"      text,
  "inReplyTo"              text,
  "references"             text,
  "bodyText"               text,
  "bodyHtml"               text,
  classification           text,
  "classificationConfidence" numeric(4, 3),
  "classificationReason"   text,
  "classifiedAt"           timestamp(3),
  "processedAt"            timestamp(3),
  "rawPayload"             jsonb,
  "receivedAt"             timestamp(3) not null default now(),
  "createdAt"              timestamp(3) not null default now(),
  "updatedAt"              timestamp(3) not null default now()
);

create unique index if not exists "InboundMessage_provider_message_id_key"
  on "InboundMessage"("providerMessageId");
create index if not exists "InboundMessage_org_received_idx"
  on "InboundMessage"("organizationId", "receivedAt");
create index if not exists "InboundMessage_org_lead_idx"
  on "InboundMessage"("organizationId", "leadId");
create index if not exists "InboundMessage_org_deal_idx"
  on "InboundMessage"("organizationId", "dealId");
create index if not exists "InboundMessage_org_outreach_idx"
  on "InboundMessage"("organizationId", "outreachMessageId");
create index if not exists "InboundMessage_in_reply_to_idx"
  on "InboundMessage"("inReplyTo");

alter table "InboundMessage"
  drop constraint if exists inbound_message_org_fk,
  add  constraint inbound_message_org_fk
    foreign key ("organizationId") references "Organization"(id) on delete cascade;

alter table "InboundMessage"
  drop constraint if exists inbound_message_outreach_fk,
  add  constraint inbound_message_outreach_fk
    foreign key ("outreachMessageId") references "OutreachMessage"(id) on delete set null;

alter table "InboundMessage"
  drop constraint if exists inbound_message_run_fk,
  add  constraint inbound_message_run_fk
    foreign key ("sequenceRunId") references "SequenceRun"(id) on delete set null;

alter table "InboundMessage"
  drop constraint if exists inbound_message_lead_fk,
  add  constraint inbound_message_lead_fk
    foreign key ("leadId") references "Lead"(id) on delete set null;

alter table "InboundMessage"
  drop constraint if exists inbound_message_deal_fk,
  add  constraint inbound_message_deal_fk
    foreign key ("dealId") references "Deal"(id) on delete set null;

alter table "InboundMessage" enable row level security;
drop policy if exists tenant_isolation on public."InboundMessage";
create policy tenant_isolation on public."InboundMessage"
  using ("organizationId" = public.current_org())
  with check ("organizationId" = public.current_org());

commit;
