alter table public.watchlist_items
  add column if not exists pinned boolean not null default false,
  add column if not exists tags text[] not null default '{}',
  add column if not exists note text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_watchlist_items_watchlist_pinned_sort
  on public.watchlist_items (watchlist_id, pinned desc, sort_order asc);
