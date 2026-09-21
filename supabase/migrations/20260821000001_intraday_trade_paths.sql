-- Persisted, normalized broker candle paths for post-trade excursion analysis.
--
-- This table stores only normalized OHLCV market data. Broker credentials and
-- raw provider responses remain backend-only and are never written here.

create table if not exists public.trade_intraday_paths (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  journal_id uuid not null,
  symbol text not null,
  broker text not null
    check (broker in ('zerodha')),
  interval text not null
    check (interval in ('5minute', '15minute', '30minute', '60minute')),
  from_at timestamptz not null,
  to_at timestamptz not null,
  source text not null default 'zerodha_kite'
    check (source in ('zerodha_kite')),
  bars jsonb not null default '[]'::jsonb
    check (jsonb_typeof(bars) = 'array'),
  bar_count integer not null default 0
    check (bar_count >= 0 and bar_count <= 20000),
  capture_status text not null default 'available'
    check (capture_status in ('available', 'partial')),
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trade_intraday_paths_bar_count_matches
    check (bar_count = jsonb_array_length(bars)),
  constraint trade_intraday_paths_user_journal_fkey
    foreign key (user_id, journal_id)
    references public.trade_journal (user_id, id)
    on delete cascade,
  constraint trade_intraday_paths_capture_identity
    unique (user_id, journal_id, broker, interval, from_at, to_at)
);

alter table public.trade_intraday_paths enable row level security;

drop policy if exists trade_intraday_paths_owner_read
  on public.trade_intraday_paths;
create policy trade_intraday_paths_owner_read
  on public.trade_intraday_paths
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- The backend captures and updates paths after validating the JWT and broker
-- connection. Browser clients may read their own normalized path summaries but
-- cannot write market evidence directly.
revoke all on table public.trade_intraday_paths from anon;
revoke insert, update, delete on table public.trade_intraday_paths from authenticated;
grant select on table public.trade_intraday_paths to authenticated;

create index if not exists trade_intraday_paths_user_journal_idx
  on public.trade_intraday_paths (user_id, journal_id, captured_at desc);

create index if not exists trade_intraday_paths_symbol_idx
  on public.trade_intraday_paths (user_id, symbol, captured_at desc);

create or replace function public.trade_intraday_paths_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trade_intraday_paths_updated_at
  on public.trade_intraday_paths;
create trigger trade_intraday_paths_updated_at
  before update on public.trade_intraday_paths
  for each row execute function public.trade_intraday_paths_set_updated_at();

comment on table public.trade_intraday_paths is
  'Owner-scoped normalized broker candle paths used to improve post-trade MAE/MFE measurement.';

comment on column public.trade_intraday_paths.bars is
  'Normalized OHLCV objects only; never store broker credentials or raw provider responses.';
