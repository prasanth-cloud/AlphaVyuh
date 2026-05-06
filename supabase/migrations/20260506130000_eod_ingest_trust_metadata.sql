-- Additive EOD ingest trust metadata.
-- The Supabase CLI is not installed in this workspace, so this migration was
-- created manually with a timestamped filename.

alter table public.bhavcopy_ingestion_log
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists source_name text default 'NSE bhavcopy EOD',
  add column if not exists source_url text,
  add column if not exists expected_rows int,
  add column if not exists coverage_pct numeric,
  add column if not exists partial_ingest boolean not null default false,
  add column if not exists warning_message text,
  add column if not exists attempt_count int not null default 0,
  add column if not exists completed_at timestamptz;

create index if not exists bhavcopy_ingestion_log_status_date
  on public.bhavcopy_ingestion_log(status, trade_date desc);

create or replace view public.data_health
with (security_invoker = true)
as
select
  (select max(trade_date) from daily_ohlcv) as latest_trade_date,
  (select count(*) from daily_ohlcv) as total_rows,
  (select count(distinct symbol)
     from daily_ohlcv
    where trade_date = (select max(trade_date) from daily_ohlcv)) as symbols_latest,
  (select count(*) from stock_universe where is_active = true) as universe_active,
  (select count(*)
     from daily_ohlcv
    where trade_date = (select max(trade_date) from daily_ohlcv)
      and rsi_14 is null) as null_rsi_latest,
  (select count(*)
     from daily_ohlcv
    where trade_date = (select max(trade_date) from daily_ohlcv)
      and ema_200 is null) as null_ema200_latest,
  extract(epoch from (now() - (select started_at from ingest_runs order by started_at desc limit 1))) / 3600
    as hours_since_last_run,
  (select run_id from ingest_runs order by started_at desc limit 1) as last_run_id,
  (select error_count from ingest_runs order by started_at desc limit 1) as last_run_errors,
  (select trade_date from bhavcopy_ingestion_log where status in ('success', 'already_done') order by trade_date desc limit 1)
    as last_successful_bhavcopy_date,
  (select trade_date from bhavcopy_ingestion_log order by updated_at desc nulls last, trade_date desc limit 1)
    as last_bhavcopy_trade_date,
  (select status from bhavcopy_ingestion_log order by updated_at desc nulls last, trade_date desc limit 1)
    as last_bhavcopy_status,
  (select rows_ingested from bhavcopy_ingestion_log order by updated_at desc nulls last, trade_date desc limit 1)
    as last_bhavcopy_rows,
  (select source_url from bhavcopy_ingestion_log order by updated_at desc nulls last, trade_date desc limit 1)
    as last_bhavcopy_source_url,
  (select error_message from bhavcopy_ingestion_log order by updated_at desc nulls last, trade_date desc limit 1)
    as last_bhavcopy_error;
