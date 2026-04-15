-- Watchlists
create table if not exists public.watchlists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  name       text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.watchlists enable row level security;
create policy "Users can manage own watchlists" on public.watchlists
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
