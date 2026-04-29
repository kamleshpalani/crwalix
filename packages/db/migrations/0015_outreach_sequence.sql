-- 0015_outreach_sequence.sql
-- Phase 1.6: Outreach sequences (cadences).
-- Adds Sequence / SequenceStep / SequenceRun tables, FKs, indexes, RLS.
-- Worker `outreach-sequence-tick` advances runs and dispatches each step
-- through the existing OutreachMessage pipeline.
--
-- Apply via: psql $DIRECT_URL -f packages/db/migrations/0015_outreach_sequence.sql
-- Or paste into the Supabase SQL editor.
--
-- Idempotent: safe to re-run.

begin;

-- -------- Sequence table -----------------------------------------------------
create table if not exists "Sequence" (
  id              text primary key,
  "organizationId" text not null,
  name            text not null,
  description     text,
  status          text not null default 'DRAFT',
  "fromEmail"     text,
  "replyToEmail"  text,
  "quietStartHour" int,
  "quietEndHour"  int,
  timezone        text,
  "createdById"   text,
  "createdAt"     timestamp(3) not null default now(),
  "updatedAt"     timestamp(3) not null default now()
);

create index if not exists "Sequence_org_status_idx"
  on "Sequence"("organizationId", status);
create unique index if not exists "Sequence_org_name_unique"
  on "Sequence"("organizationId", name);

alter table "Sequence"
  drop constraint if exists sequence_org_fk,
  add  constraint sequence_org_fk
    foreign key ("organizationId") references "Organization"(id) on delete cascade;

alter table "Sequence" enable row level security;
drop policy if exists tenant_isolation on public."Sequence";
create policy tenant_isolation on public."Sequence"
  using ("organizationId" = public.current_org())
  with check ("organizationId" = public.current_org());

-- -------- SequenceStep table -------------------------------------------------
create table if not exists "SequenceStep" (
  id               text primary key,
  "organizationId" text not null,
  "sequenceId"     text not null,
  position         int  not null,
  channel          text not null default 'EMAIL',
  "delayHours"     int  not null default 0,
  "subjectTemplate" text not null,
  "bodyTemplate"   text not null,
  "bodyIsHtml"     boolean not null default false,
  "createdAt"      timestamp(3) not null default now(),
  "updatedAt"      timestamp(3) not null default now()
);

create index if not exists "SequenceStep_org_seq_pos_idx"
  on "SequenceStep"("organizationId", "sequenceId", position);
create unique index if not exists "SequenceStep_seq_pos_unique"
  on "SequenceStep"("sequenceId", position);

alter table "SequenceStep"
  drop constraint if exists sequence_step_org_fk,
  add  constraint sequence_step_org_fk
    foreign key ("organizationId") references "Organization"(id) on delete cascade;

alter table "SequenceStep"
  drop constraint if exists sequence_step_seq_fk,
  add  constraint sequence_step_seq_fk
    foreign key ("sequenceId") references "Sequence"(id) on delete cascade;

alter table "SequenceStep" enable row level security;
drop policy if exists tenant_isolation on public."SequenceStep";
create policy tenant_isolation on public."SequenceStep"
  using ("organizationId" = public.current_org())
  with check ("organizationId" = public.current_org());

-- -------- SequenceRun table --------------------------------------------------
create table if not exists "SequenceRun" (
  id               text primary key,
  "organizationId" text not null,
  "sequenceId"     text not null,
  "leadId"         text,
  "dealId"         text,
  "toEmail"        text not null,
  status           text not null default 'RUNNING',
  "currentStepIndex" int not null default 0,
  "startedAt"      timestamp(3) not null default now(),
  "lastSendAt"     timestamp(3),
  "nextRunAt"      timestamp(3),
  "completedAt"    timestamp(3),
  "pausedAt"       timestamp(3),
  "pauseReason"    text,
  vars             jsonb,
  "createdById"    text,
  "createdAt"      timestamp(3) not null default now(),
  "updatedAt"      timestamp(3) not null default now()
);

create index if not exists "SequenceRun_org_status_next_idx"
  on "SequenceRun"("organizationId", status, "nextRunAt");
create index if not exists "SequenceRun_org_lead_idx"
  on "SequenceRun"("organizationId", "leadId");
create index if not exists "SequenceRun_org_deal_idx"
  on "SequenceRun"("organizationId", "dealId");

alter table "SequenceRun"
  drop constraint if exists sequence_run_org_fk,
  add  constraint sequence_run_org_fk
    foreign key ("organizationId") references "Organization"(id) on delete cascade;

alter table "SequenceRun"
  drop constraint if exists sequence_run_seq_fk,
  add  constraint sequence_run_seq_fk
    foreign key ("sequenceId") references "Sequence"(id) on delete cascade;

alter table "SequenceRun"
  drop constraint if exists sequence_run_lead_fk,
  add  constraint sequence_run_lead_fk
    foreign key ("leadId") references "Lead"(id) on delete set null;

alter table "SequenceRun"
  drop constraint if exists sequence_run_deal_fk,
  add  constraint sequence_run_deal_fk
    foreign key ("dealId") references "Deal"(id) on delete set null;

alter table "SequenceRun" enable row level security;
drop policy if exists tenant_isolation on public."SequenceRun";
create policy tenant_isolation on public."SequenceRun"
  using ("organizationId" = public.current_org())
  with check ("organizationId" = public.current_org());

commit;
