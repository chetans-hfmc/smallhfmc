-- HFMC Case Tracker — Supabase setup
-- Run this once in: Supabase Dashboard → SQL Editor → New query → paste → Run

create table if not exists public.app_state (
  id int primary key,
  state jsonb not null,
  updated_at timestamptz default now()
);

-- v1 shared-state model: the whole workspace is one JSON document (single row).
-- Perfect for a small team; migrating to per-table storage later is an upgrade, not a rebuild.

alter table public.app_state enable row level security;

-- the app writes with the public anon key (authenticated logins come in Phase 5.2)
drop policy if exists "anon read app_state" on public.app_state;
create policy "anon read app_state" on public.app_state for select to anon using (true);

drop policy if exists "anon write app_state" on public.app_state;
create policy "anon write app_state" on public.app_state for insert to anon with check (true);

drop policy if exists "anon update app_state" on public.app_state;
create policy "anon update app_state" on public.app_state for update to anon using (true);

-- seed the single row the app upserts into
insert into public.app_state (id, state)
values (1, '{}'::jsonb)
on conflict (id) do nothing;
