-- 0043_crm_stages_followup_tasks.sql
-- §12 CRM Pipeline Module
--
-- 1. Expand default pipeline from 6 → 15 canonical stages.
-- 2. Add Deal.followUpAt  — next follow-up reminder date.
-- 3. Add Activity.dueAt   — task due date (used when kind = TASK).
-- 4. Add Activity.isDone  — task completion flag.
--
-- Idempotent: safe to re-run. Uses IF NOT EXISTS / ON CONFLICT.
-- Apply via: psql $DIRECT_URL -f packages/db/migrations/0043_crm_stages_followup_tasks.sql

begin;

-- -------- 1. New columns ------------------------------------------------------

alter table "Deal"
  add column if not exists "followUpAt" timestamptz;

comment on column "Deal"."followUpAt" is
  'Optional next follow-up reminder date set by the owner.';

alter table "Activity"
  add column if not exists "dueAt" timestamptz;

comment on column "Activity"."dueAt" is
  'Due date; meaningful only when kind = TASK.';

alter table "Activity"
  add column if not exists "isDone" boolean not null default false;

comment on column "Activity"."isDone" is
  'Task completion flag; meaningful only when kind = TASK.';

-- Index to surface open tasks efficiently.
create index if not exists activity_open_tasks_idx
  on "Activity" ("organizationId", "dealId", "isDone", "dueAt")
  where "isDone" = false;

-- Index to surface upcoming follow-ups for the dashboard / reminders.
create index if not exists deal_followup_idx
  on "Deal" ("organizationId", "followUpAt")
  where "followUpAt" is not null;

-- -------- 2. Update seed_default_pipeline to 15 stages -----------------------
--
-- Stage layout §12.1:
--   pos  0  New lead           5%   (top of funnel)
--   pos  1  Enriched          10%
--   pos  2  Qualified         20%
--   pos  3  Contact approved  25%
--   pos  4  Contacted         30%
--   pos  5  Follow-up required 35%
--   pos  6  Replied           45%
--   pos  7  Interested        55%
--   pos  8  Proposal requested 65%
--   pos  9  Proposal sent     70%
--   pos 10  Negotiation       80%
--   pos 11  Won              100%   isWon=true
--   pos 12  Lost               0%   isLost=true
--   pos 13  Not suitable        0%   isLost=true
--   pos 14  Do not contact      0%   isLost=true

create or replace function public.seed_default_pipeline(org_id text)
returns text
language plpgsql
as $$
declare
  pid text;
  -- columns: name, position, probability, isWon, isLost
  stages constant text[][] := array[
    array['New lead',            '0',  '5',   'false', 'false'],
    array['Enriched',            '1',  '10',  'false', 'false'],
    array['Qualified',           '2',  '20',  'false', 'false'],
    array['Contact approved',    '3',  '25',  'false', 'false'],
    array['Contacted',           '4',  '30',  'false', 'false'],
    array['Follow-up required',  '5',  '35',  'false', 'false'],
    array['Replied',             '6',  '45',  'false', 'false'],
    array['Interested',          '7',  '55',  'false', 'false'],
    array['Proposal requested',  '8',  '65',  'false', 'false'],
    array['Proposal sent',       '9',  '70',  'false', 'false'],
    array['Negotiation',        '10',  '80',  'false', 'false'],
    array['Won',                '11',  '100', 'true',  'false'],
    array['Lost',               '12',  '0',   'false', 'true'],
    array['Not suitable',       '13',  '0',   'false', 'true'],
    array['Do not contact',     '14',  '0',   'false', 'true']
  ];
  row text[];
begin
  -- 1. Find or create the default pipeline.
  select id into pid
    from public."Pipeline"
   where "organizationId" = org_id
     and "isDefault" = true
   limit 1;

  if pid is null then
    pid := gen_random_uuid()::text;
    insert into public."Pipeline" (id, "organizationId", name, "isDefault", "createdAt", "updatedAt")
    values (pid, org_id, 'Sales Pipeline', true, now(), now());
  end if;

  -- 2. Upsert each stage.
  --    ON CONFLICT DO UPDATE ensures existing orgs get the new names/probabilities
  --    at positions 0-10, and new positions 11-14 are inserted.
  foreach row slice 1 in array stages loop
    insert into public."PipelineStage" (
      id, "organizationId", "pipelineId", name, position,
      probability, "isWon", "isLost", "createdAt"
    )
    values (
      gen_random_uuid()::text, org_id, pid,
      row[1],
      row[2]::int,
      row[3]::int,
      row[4]::boolean,
      row[5]::boolean,
      now()
    )
    on conflict ("pipelineId", position) do update
      set name        = excluded.name,
          probability = excluded.probability,
          "isWon"     = excluded."isWon",
          "isLost"    = excluded."isLost";
  end loop;

  return pid;
end;
$$;

-- -------- 3. Re-seed trigger (unchanged function, already exists) -------------
-- The trigger on Organization INSERT is already set by 0012_crm_pipeline_seed.sql.
-- Re-run to make sure it points at the updated function.
create or replace function public.tg_seed_default_pipeline()
returns trigger
language plpgsql
as $$
begin
  perform public.seed_default_pipeline(new.id);
  return new;
end;
$$;

drop trigger if exists organization_seed_default_pipeline on public."Organization";
create trigger organization_seed_default_pipeline
  after insert on public."Organization"
  for each row
  execute function public.tg_seed_default_pipeline();

-- -------- 4. Backfill existing organizations ---------------------------------
do $$
declare org record;
begin
  for org in select id from public."Organization" loop
    perform public.seed_default_pipeline(org.id);
  end loop;
end $$;

commit;
