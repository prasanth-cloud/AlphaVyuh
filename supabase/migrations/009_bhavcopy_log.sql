-- Bhavcopy ingestion log
create table if not exists public.bhavcopy_ingestion_log (
  trade_date     date primary key,
  status         text not null default 'pending',
  rows_ingested  int,
  error_message  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
