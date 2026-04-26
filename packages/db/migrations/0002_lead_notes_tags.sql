-- Lead notes & tags. Apply via:
--   npx prisma migrate dev --name lead_notes_tags
-- or paste into Supabase SQL editor.

alter table "Lead"
  add column if not exists "notes" text,
  add column if not exists "tags" text[] not null default '{}';

create index if not exists "Lead_organizationId_tags_idx"
  on "Lead" using gin ("tags");
