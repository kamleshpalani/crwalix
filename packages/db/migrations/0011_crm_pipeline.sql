-- 0011_crm_pipeline.sql
-- CRM tables introduced in Phase 1: Pipeline, PipelineStage, Deal, Activity, Proposal.
-- Run AFTER `prisma migrate deploy` has created the underlying tables (the
-- Prisma migration itself only generates DDL; this file adds FK + RLS).
--
-- Apply via: psql $DIRECT_URL -f packages/db/migrations/0011_crm_pipeline.sql
-- Or paste into the Supabase SQL editor.

begin;

-- -------- Foreign keys --------------------------------------------------------
-- Cross-table integrity that Prisma can't express because the new models
-- intentionally do not declare @relation blocks (to keep the migration
-- self-contained).

alter table "Pipeline"
  drop constraint if exists pipeline_org_fk,
  add  constraint pipeline_org_fk
    foreign key ("organizationId") references "Organization"(id) on delete cascade;

alter table "PipelineStage"
  drop constraint if exists pipeline_stage_org_fk,
  add  constraint pipeline_stage_org_fk
    foreign key ("organizationId") references "Organization"(id) on delete cascade;

alter table "PipelineStage"
  drop constraint if exists pipeline_stage_pipeline_fk,
  add  constraint pipeline_stage_pipeline_fk
    foreign key ("pipelineId") references "Pipeline"(id) on delete cascade;

alter table "Deal"
  drop constraint if exists deal_org_fk,
  add  constraint deal_org_fk
    foreign key ("organizationId") references "Organization"(id) on delete cascade;

alter table "Deal"
  drop constraint if exists deal_pipeline_fk,
  add  constraint deal_pipeline_fk
    foreign key ("pipelineId") references "Pipeline"(id) on delete cascade;

alter table "Deal"
  drop constraint if exists deal_stage_fk,
  add  constraint deal_stage_fk
    foreign key ("stageId") references "PipelineStage"(id) on delete restrict;

alter table "Deal"
  drop constraint if exists deal_lead_fk,
  add  constraint deal_lead_fk
    foreign key ("leadId") references "Lead"(id) on delete set null;

alter table "Activity"
  drop constraint if exists activity_org_fk,
  add  constraint activity_org_fk
    foreign key ("organizationId") references "Organization"(id) on delete cascade;

alter table "Activity"
  drop constraint if exists activity_deal_fk,
  add  constraint activity_deal_fk
    foreign key ("dealId") references "Deal"(id) on delete cascade;

alter table "Activity"
  drop constraint if exists activity_lead_fk,
  add  constraint activity_lead_fk
    foreign key ("leadId") references "Lead"(id) on delete set null;

alter table "Proposal"
  drop constraint if exists proposal_org_fk,
  add  constraint proposal_org_fk
    foreign key ("organizationId") references "Organization"(id) on delete cascade;

alter table "Proposal"
  drop constraint if exists proposal_deal_fk,
  add  constraint proposal_deal_fk
    foreign key ("dealId") references "Deal"(id) on delete cascade;

alter table "Proposal"
  drop constraint if exists proposal_lead_fk,
  add  constraint proposal_lead_fk
    foreign key ("leadId") references "Lead"(id) on delete set null;

-- -------- Row-level security --------------------------------------------------
-- Same tenant-isolation pattern used by 0001_rls.sql: rows are visible iff
-- their organizationId matches app.current_org set by the app on each tx.

alter table "Pipeline"      enable row level security;
alter table "PipelineStage" enable row level security;
alter table "Deal"          enable row level security;
alter table "Activity"      enable row level security;
alter table "Proposal"      enable row level security;

do $$
declare t text;
begin
  for t in
    select unnest(array['Pipeline','PipelineStage','Deal','Activity','Proposal'])
  loop
    execute format($f$
      drop policy if exists tenant_isolation on public.%I;
      create policy tenant_isolation on public.%I
        using ("organizationId" = public.current_org())
        with check ("organizationId" = public.current_org());
    $f$, t, t);
  end loop;
end $$;

commit;
