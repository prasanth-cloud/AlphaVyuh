-- Scanner intelligence foundation for founder beta.
--
-- Adds canonical swing-trading read-model fields used by the six trader
-- scanner presets. This migration is intentionally schema-only so it can be
-- applied safely through the Supabase dashboard/management API without a long
-- historical backfill. Daily EOD refresh jobs populate these fields going
-- forward; historical backfill should run as a separate bounded operator job.

set statement_timeout = '0';

alter table public.daily_ohlcv
  add column if not exists ema_150 numeric(12,2),
  add column if not exists ema_200_slope_30d numeric(10,4),
  add column if not exists avg_volume_50d bigint,
  add column if not exists price_perf_6m_pct numeric(10,4),
  add column if not exists high_3w numeric(12,2),
  add column if not exists low_3w numeric(12,2),
  add column if not exists darvas_box_height_pct numeric(10,4),
  add column if not exists is_nr7 boolean default false;

create table if not exists public.weekly_ohlcv (
  symbol text not null references public.stock_universe(symbol) on delete cascade,
  week_start date not null,
  week_end date not null,
  open numeric(12,2),
  high numeric(12,2),
  low numeric(12,2),
  close numeric(12,2),
  volume bigint,
  weekly_ema_30 numeric(12,2),
  weekly_ema_30_slope numeric(10,4),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (symbol, week_start)
);

reset statement_timeout;
