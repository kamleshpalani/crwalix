-- 0013_project_kickoff.sql
-- Phase 2.c: Project lifecycle on Won deals.
-- Adds Project status/dealId/leadId columns, ProjectTask table, RLS,
-- and a `seed_default_project_tasks` function that lays down the kickoff
-- checklist whenever a deal moves to a Won stage.
--
-- Apply via: psql $DIRECT_URL -f packages/db/migrations/0013_project_kickoff.sql
-- Or paste into the Supabase SQL editor.
--
-- Idempotent: safe to re-run.

begin;

-- -------- Project columns -----------------------------------------------------
alter table "Project"
  add column if not exists "dealId"      text,
  add column if not exists "leadId"      text,
  add column if not exists "status"      text not null default 'PLANNING',
  add column if not exists "kickoffAt"   timestamp(3),
  add column if not exists "completedAt" timestamp(3);

create unique index if not exists "Project_dealId_key" on "Project"("dealId");
create index if not exists "Project_org_status_idx"   on "Project"("organizationId","status");
create index if not exists "Project_org_lead_idx"     on "Project"("organizationId","leadId");

-- -------- Deal projectId link -------------------------------------------------
alter table "Deal"
  add column if not exists "projectId" text;

create unique index if not exists "Deal_projectId_key" on "Deal"("projectId");

-- -------- ProjectTask table ---------------------------------------------------
create table if not exists "ProjectTask" (
  id              text primary key,
  "organizationId" text not null,
  "projectId"     text not null,
  title           text not null,
  description     text,
  status          text not null default 'TODO',
  position        int  not null default 0,
  "dueAt"         timestamp(3),
  "assigneeUserId" text,
  "completedAt"   timestamp(3),
  "createdAt"     timestamp(3) not null default now(),
  "updatedAt"     timestamp(3) not null default now()
);

create index if not exists "ProjectTask_org_proj_pos_idx"
  on "ProjectTask"("organizationId","projectId","position");
create index if not exists "ProjectTask_org_status_idx"
  on "ProjectTask"("organizationId","status");

-- -------- Foreign keys --------------------------------------------------------
alter table "ProjectTask"
  drop constraint if exists project_task_org_fk,
  add  constraint project_task_org_fk
    foreign key ("organizationId") references "Organization"(id) on delete cascade;

alter table "ProjectTask"
  drop constraint if exists project_task_project_fk,
  add  constraint project_task_project_fk
    foreign key ("projectId") references "Project"(id) on delete cascade;

alter table "Project"
  drop constraint if exists project_deal_fk,
  add  constraint project_deal_fk
    foreign key ("dealId") references "Deal"(id) on delete set null;

alter table "Project"
  drop constraint if exists project_lead_fk,
  add  constraint project_lead_fk
    foreign key ("leadId") references "Lead"(id) on delete set null;

alter table "Deal"
  drop constraint if exists deal_project_fk,
  add  constraint deal_project_fk
    foreign key ("projectId") references "Project"(id) on delete set null;

-- -------- Row-level security --------------------------------------------------
alter table "ProjectTask" enable row level security;

drop policy if exists tenant_isolation on public."ProjectTask";
create policy tenant_isolation on public."ProjectTask"
  using ("organizationId" = public.current_org())
  with check ("organizationId" = public.current_org());

-- -------- Default kickoff checklist ------------------------------------------
-- Inserts the standard onboarding tasks for a freshly created project.
-- Idempotent via (projectId, position) — re-running produces no duplicates.

create or replace function public.seed_default_project_tasks(
  project_id text,
  org_id text
)
returns void
language plpgsql
as $$
declare
  tasks constant text[][] := array[
    -- title                              , description                                           , position
    array['Send welcome email',            'Confirm scope, expectations, and key contacts',          '0'],
    array['Schedule kickoff call',         'Align on goals, timeline, and success metrics',          '1'],
    array['Collect brand assets',          'Logos, brand guide, copy, references',                   '2'],
    array['Define milestones',             'Break the engagement into 3-5 measurable milestones',    '3'],
    array['Set up shared workspace',       'Slack channel / shared drive / project board',           '4'],
    array['Send first invoice',            'Trigger billing per agreed schedule',                    '5']
  ];
  row text[];
begin
  foreach row slice 1 in array tasks loop
    if not exists (
      select 1 from public."ProjectTask"
       where "projectId" = project_id and position = row[3]::int
    ) then
      insert into public."ProjectTask" (
        id, "organizationId", "projectId", title, description, position,
        "createdAt", "updatedAt"
      ) values (
        gen_random_uuid()::text, org_id, project_id,
        row[1], row[2], row[3]::int, now(), now()
      );
    end if;
  end loop;
end;
$$;

commit;
