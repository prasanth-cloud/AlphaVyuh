-- Daily OHLCV bars + pre-computed indicators
create table if not exists public.daily_ohlcv (
  symbol         text not null,
  trade_date     date not null,
  open           numeric(12,2),
  high           numeric(12,2),
  low            numeric(12,2),
  close          numeric(12,2),
  prev_close     numeric(12,2),
  volume         bigint,
  turnover       numeric(18,2),
  -- Pre-computed indicators (updated after each ingest)
  avg_volume_20d bigint,
  week_52_high   numeric(12,2),
  week_52_low    numeric(12,2),
  rsi_14         numeric(8,2),
  ema_20         numeric(12,2),
  ema_50         numeric(12,2),
  ema_200        numeric(12,2),
  atr_14         numeric(10,4),
  primary key (symbol, trade_date)
);

create index if not exists idx_daily_ohlcv_symbol on public.daily_ohlcv(symbol);
create index if not exists idx_daily_ohlcv_trade_date on public.daily_ohlcv(trade_date desc);
create index if not exists idx_daily_ohlcv_rsi on public.daily_ohlcv(rsi_14) where rsi_14 is not null;
create index if not exists idx_daily_ohlcv_volume on public.daily_ohlcv(volume desc);
