-- Migration 0024 — Module #14 self-hosted invoicing
-- Adds optional title/customer fields and shareToken for public payment page.
-- Prisma already creates the columns via `prisma db push` / `migrate`; this
-- file documents the indexes/constraints needed.

-- Unique index on shareToken (Prisma also emits one — this is idempotent).
do $$ begin
  if not exists (
    select 1 from pg_indexes where schemaname='public' and indexname='Invoice_shareToken_key'
  ) then
    create unique index "Invoice_shareToken_key" on "Invoice"("shareToken");
  end if;
end $$;
