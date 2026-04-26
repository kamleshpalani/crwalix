-- Crawlix initial schema
-- Run in Supabase SQL Editor (Dashboard -> SQL -> New query), or via psql.
--
-- This creates the `jobs` table. Row-Level Security is enabled but without
-- policies yet; the backend connects with the service_role key which bypasses
-- RLS. User-scoped policies will land in Phase 2 (auth).

create extension if not exists "pgcrypto";

create table if not exists public.jobs (
  id                text primary key,
  adapter           text not null,
  status            text not null check (status in ('queued','running','completed','failed','canceled')),
  input             jsonb not null default '{}'::jsonb,
  result            jsonb,
  error             text,
  progress          real,
  items_collected   integer,
  created_at        timestamptz not null default now(),
  started_at        timestamptz,
  finished_at       timestamptz,
  -- User ownership (nullable for now; required once auth lands in Phase 2)
  user_id           uuid
);

create index if not exists jobs_created_at_idx on public.jobs (created_at desc);
create index if not exists jobs_status_idx     on public.jobs (status);
create index if not exists jobs_adapter_idx    on public.jobs (adapter);
create index if not exists jobs_user_idx       on public.jobs (user_id);

alter table public.jobs enable row level security;

-- No policies yet. Backend uses service_role which bypasses RLS.
-- Phase 2 will add:
--   create policy "jobs_select_own" on public.jobs for select using (auth.uid() = user_id);
--   create policy "jobs_insert_own" on public.jobs for insert with check (auth.uid() = user_id);

-- Realtime (Phase 3): run this from the SQL editor to broadcast changes.
-- alter publication supabase_realtime add table public.jobs;
