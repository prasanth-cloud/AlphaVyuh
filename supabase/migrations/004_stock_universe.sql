-- NSE/BSE stock master
create table if not exists public.stock_universe (
  symbol       text primary key,
  company_name text,
  series       text,
  isin         text,
  sector       text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_stock_universe_series on public.stock_universe(series);
create index if not exists idx_stock_universe_active on public.stock_universe(is_active);
