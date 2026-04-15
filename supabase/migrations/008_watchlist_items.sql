-- Watchlist items
create table if not exists public.watchlist_items (
  id           uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references public.watchlists(id) on delete cascade,
  symbol       text not null,
  sort_order   int not null default 0,
  added_at     timestamptz not null default now(),
  unique (watchlist_id, symbol)
);

alter table public.watchlist_items enable row level security;
create policy "Users can manage own watchlist items" on public.watchlist_items
  using (
    exists (
      select 1 from public.watchlists w
      where w.id = watchlist_id and w.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.watchlists w
      where w.id = watchlist_id and w.user_id = auth.uid()
    )
  );
