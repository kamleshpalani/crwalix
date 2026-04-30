-- 0021_support.sql
-- Phase 4.4/4.5: Support inbox + Knowledge base.
-- Run AFTER `prisma migrate deploy` (or `prisma db push`) has created the
-- KnowledgeArticle, SupportTicket, and SupportMessage tables.
--
-- Apply via: psql $DIRECT_URL -f packages/db/migrations/0021_support.sql
-- Or paste into the Supabase SQL editor.

begin;

-- -------- Foreign keys ------------------------------------------------------
alter table "KnowledgeArticle"
  drop constraint if exists knowledge_article_org_fk,
  add  constraint knowledge_article_org_fk
    foreign key ("organizationId") references "Organization"(id) on delete cascade;

alter table "SupportTicket"
  drop constraint if exists support_ticket_org_fk,
  add  constraint support_ticket_org_fk
    foreign key ("organizationId") references "Organization"(id) on delete cascade;

alter table "SupportTicket"
  drop constraint if exists support_ticket_lead_fk,
  add  constraint support_ticket_lead_fk
    foreign key ("leadId") references "Lead"(id) on delete set null;

alter table "SupportMessage"
  drop constraint if exists support_message_org_fk,
  add  constraint support_message_org_fk
    foreign key ("organizationId") references "Organization"(id) on delete cascade;

-- ticketId FK is created by Prisma via the @relation block.

-- -------- Row-level security ------------------------------------------------
alter table "KnowledgeArticle" enable row level security;
alter table "SupportTicket"    enable row level security;
alter table "SupportMessage"   enable row level security;

do $$
declare t text;
begin
  for t in
    select unnest(array['KnowledgeArticle','SupportTicket','SupportMessage'])
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
