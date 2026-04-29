-- 0012_crm_pipeline_seed.sql
-- Seed a default CRM pipeline + standard stages for every organization.
-- Depends on 0011_crm_pipeline.sql (FKs + RLS).
--
-- Apply via: psql $DIRECT_URL -f packages/db/migrations/0012_crm_pipeline_seed.sql
-- Or paste into the Supabase SQL editor.
--
-- Idempotent: safe to re-run. Existing orgs are backfilled at the bottom.

begin;

-- -------- Seed function ------------------------------------------------------
-- Creates the default pipeline for the given organization (if missing) and
-- ensures the canonical six stages exist with the correct ordering and
-- forecasting probabilities.
--
-- Stage layout matches docs/AUTOMATION_ROADMAP.md §2:
--   0  Discovery     (10%)
--   1  Qualified     (25%)
--   2  Proposal      (50%)
--   3  Negotiation   (75%)
--   4  Won           (100%, isWon)
--   5  Lost          (0%,   isLost)

create or replace function public.seed_default_pipeline(org_id text)
returns text
language plpgsql
as $$
declare
  pid text;
  stages constant text[][] := array[
    -- name,        position, probability, isWon, isLost
    array['Discovery',   '0',  '10',  'false', 'false'],
    array['Qualified',   '1',  '25',  'false', 'false'],
    array['Proposal',    '2',  '50',  'false', 'false'],
    array['Negotiation', '3',  '75',  'false', 'false'],
    array['Won',         '4',  '100', 'true',  'false'],
    array['Lost',        '5',  '0',   'false', 'true']
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

  -- 2. Upsert each stage. The (pipelineId, position) unique index guarantees
  --    we either insert a new row or no-op via on conflict.
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
    on conflict ("pipelineId", position) do nothing;
  end loop;

  return pid;
end;
$$;

-- -------- Trigger: auto-seed on new Organization -----------------------------
-- Every new tenant gets the default pipeline immediately so the CRM UI has
-- something to render on first login.

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

-- -------- Backfill existing organizations ------------------------------------
-- Run once for every existing tenant. seed_default_pipeline is idempotent,
-- so this is safe even if some orgs were partially seeded manually.

do $$
declare org record;
begin
  for org in select id from public."Organization" loop
    perform public.seed_default_pipeline(org.id);
  end loop;
end $$;

commit;
