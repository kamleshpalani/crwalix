-- 0023_contracts.sql
-- Module #11: Contract & agreement (in-app e-sign).

begin;

alter table "Contract"
  drop constraint if exists contract_org_fk,
  add  constraint contract_org_fk
    foreign key ("organizationId") references "Organization"(id) on delete cascade;

alter table "Contract"
  drop constraint if exists contract_deal_fk,
  add  constraint contract_deal_fk
    foreign key ("dealId") references "Deal"(id) on delete set null;

alter table "Contract"
  drop constraint if exists contract_lead_fk,
  add  constraint contract_lead_fk
    foreign key ("leadId") references "Lead"(id) on delete set null;

alter table "Contract"
  drop constraint if exists contract_project_fk,
  add  constraint contract_project_fk
    foreign key ("projectId") references "Project"(id) on delete set null;

alter table "Contract"
  drop constraint if exists contract_quote_fk,
  add  constraint contract_quote_fk
    foreign key ("quoteId") references "Quote"(id) on delete set null;

create unique index if not exists "Contract_org_number_uniq"
  on "Contract" ("organizationId", "number")
  where "number" is not null;

alter table "Contract" enable row level security;

drop policy if exists tenant_isolation on public."Contract";
create policy tenant_isolation on public."Contract"
  using ("organizationId" = public.current_org())
  with check ("organizationId" = public.current_org());

commit;
