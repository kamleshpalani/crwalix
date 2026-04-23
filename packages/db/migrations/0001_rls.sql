-- RLS policies. Apply AFTER `prisma migrate dev` has created the base tables.
-- Run via: psql $DATABASE_URL -f packages/db/migrations/0001_rls.sql
-- Or paste into the Supabase SQL editor.

-- Helper: read the current organization id from session config.
create or replace function public.current_org() returns uuid
language sql stable as $$
  select nullif(current_setting('app.current_org', true), '')::uuid;
$$;

-- Enable RLS on every tenant-scoped table.
alter table "Project"          enable row level security;
alter table "Search"           enable row level security;
alter table "SearchRun"        enable row level security;
alter table "Lead"             enable row level security;
alter table "LeadSource"       enable row level security;
alter table "LeadScore"        enable row level security;
alter table "Enrichment"       enable row level security;
alter table "LeadList"         enable row level security;
alter table "LeadListItem"     enable row level security;
alter table "ExportJob"        enable row level security;
alter table "BackgroundJob"    enable row level security;
alter table "UsageLog"         enable row level security;
alter table "ProviderConfig"   enable row level security;
alter table "ApiKey"           enable row level security;
alter table "AuditLog"         enable row level security;
alter table "Subscription"     enable row level security;
alter table "OrganizationMember" enable row level security;

-- Generic tenant-isolation template. Creates a policy matching `organization_id`
-- against the session's current_org. Tables without that column (e.g. join
-- tables) get custom policies below.
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'Project','Search','SearchRun','Lead','Enrichment',
      'LeadList','ExportJob','UsageLog','ProviderConfig','ApiKey','Subscription'
    ])
  loop
    execute format($f$
      drop policy if exists tenant_isolation on public.%I;
      create policy tenant_isolation on public.%I
        using ("organizationId" = public.current_org())
        with check ("organizationId" = public.current_org());
    $f$, t, t);
  end loop;
end $$;

-- Join tables inherit their parent's tenant via the foreign key.
drop policy if exists tenant_isolation on public."LeadSource";
create policy tenant_isolation on public."LeadSource"
  using (
    exists (
      select 1 from public."Lead" l
      where l.id = "LeadSource"."leadId" and l."organizationId" = public.current_org()
    )
  );

drop policy if exists tenant_isolation on public."LeadScore";
create policy tenant_isolation on public."LeadScore"
  using (
    exists (
      select 1 from public."Lead" l
      where l.id = "LeadScore"."leadId" and l."organizationId" = public.current_org()
    )
  );

drop policy if exists tenant_isolation on public."LeadListItem";
create policy tenant_isolation on public."LeadListItem"
  using (
    exists (
      select 1 from public."LeadList" ll
      where ll.id = "LeadListItem"."listId" and ll."organizationId" = public.current_org()
    )
  );

drop policy if exists tenant_isolation on public."OrganizationMember";
create policy tenant_isolation on public."OrganizationMember"
  using ("organizationId" = public.current_org());

drop policy if exists tenant_isolation on public."AuditLog";
create policy tenant_isolation on public."AuditLog"
  using ("organizationId" is null or "organizationId" = public.current_org());

drop policy if exists tenant_isolation on public."BackgroundJob";
create policy tenant_isolation on public."BackgroundJob"
  using ("organizationId" is null or "organizationId" = public.current_org());

-- The backend worker connects with a role that bypasses RLS for system work
-- (e.g. scheduled jobs). Recommended: create a `crawlix_worker` role and
-- `alter role crawlix_worker bypassrls`. The web tier uses the standard role.
