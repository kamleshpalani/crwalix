-- 0022_quotes.sql
-- Module #10: Quotation & pricing.
-- Apply AFTER `prisma db push`/`prisma migrate deploy`.

begin;

alter table "Quote"
  drop constraint if exists quote_org_fk,
  add  constraint quote_org_fk
    foreign key ("organizationId") references "Organization"(id) on delete cascade;

alter table "Quote"
  drop constraint if exists quote_deal_fk,
  add  constraint quote_deal_fk
    foreign key ("dealId") references "Deal"(id) on delete set null;

alter table "Quote"
  drop constraint if exists quote_lead_fk,
  add  constraint quote_lead_fk
    foreign key ("leadId") references "Lead"(id) on delete set null;

alter table "Quote"
  drop constraint if exists quote_project_fk,
  add  constraint quote_project_fk
    foreign key ("projectId") references "Project"(id) on delete set null;

alter table "QuoteLineItem"
  drop constraint if exists quote_line_org_fk,
  add  constraint quote_line_org_fk
    foreign key ("organizationId") references "Organization"(id) on delete cascade;

-- Per-org uniqueness on number (allow null).
create unique index if not exists "Quote_org_number_uniq"
  on "Quote" ("organizationId", "number")
  where "number" is not null;

alter table "Quote"          enable row level security;
alter table "QuoteLineItem"  enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array['Quote','QuoteLineItem'])
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
