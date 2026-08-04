-- Backsound favorites per user (Naratif Video Maker & modul lain).
create table if not exists public.user_backsound_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  url text not null,
  duration numeric not null default 0,
  mood text,
  created_at timestamptz not null default now(),
  unique (user_id, url)
);

grant select, insert, update, delete on public.user_backsound_favorites to authenticated;
grant all on public.user_backsound_favorites to service_role;

alter table public.user_backsound_favorites enable row level security;

drop policy if exists "own backsound favorites select" on public.user_backsound_favorites;
create policy "own backsound favorites select"
  on public.user_backsound_favorites for select
  to authenticated using (auth.uid() = user_id);

drop policy if exists "own backsound favorites insert" on public.user_backsound_favorites;
create policy "own backsound favorites insert"
  on public.user_backsound_favorites for insert
  to authenticated with check (auth.uid() = user_id);

drop policy if exists "own backsound favorites update" on public.user_backsound_favorites;
create policy "own backsound favorites update"
  on public.user_backsound_favorites for update
  to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own backsound favorites delete" on public.user_backsound_favorites;
create policy "own backsound favorites delete"
  on public.user_backsound_favorites for delete
  to authenticated using (auth.uid() = user_id);

create index if not exists user_backsound_favorites_user_idx
  on public.user_backsound_favorites (user_id, created_at desc);
