-- EOD quality evidence and generic operational job history.
--
-- Market-data writes remain service-role-only. The job history is operational
-- evidence, not user data, so it has no authenticated/public read policy.

create table if not exists public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  trade_date date,
  status text not null default 'running'
    check (status in ('running', 'success', 'partial', 'failed', 'skipped')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer,
  input_payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error jsonb,
  created_at timestamptz not null default now()
);

create index if not exists job_runs_type_started_idx
  on public.job_runs(job_type, started_at desc);

create index if not exists job_runs_trade_date_idx
  on public.job_runs(trade_date desc, started_at desc);

alter table public.job_runs enable row level security;

revoke all on table public.job_runs from anon, authenticated;
grant all on table public.job_runs to service_role;

alter table public.bhavcopy_ingestion_log
  add column if not exists job_run_id uuid references public.job_runs(id) on delete set null,
  add column if not exists quality_status text,
  add column if not exists source_rows integer,
  add column if not exists accepted_rows integer,
  add column if not exists filtered_series_rows integer,
  add column if not exists missing_required_rows integer,
  add column if not exists invalid_ohlcv_rows integer,
  add column if not exists duplicate_rows integer,
  add column if not exists quality_summary jsonb;

create index if not exists bhavcopy_ingestion_log_job_run_idx
  on public.bhavcopy_ingestion_log(job_run_id);

comment on table public.job_runs is
  'Service-owned operational history for EOD imports, scans, and maintenance jobs.';

comment on column public.bhavcopy_ingestion_log.quality_summary is
  'Explicit EOD validation counts and reasons; market data is not trusted without this evidence.';
