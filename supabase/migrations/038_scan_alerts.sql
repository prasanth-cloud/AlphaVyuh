-- Saved EOD scan alerts and per-run match snapshots.
-- NOTE: Supabase CLI was unavailable in this environment, so this migration was
-- created manually using the repo's existing numbered migration sequence.

create table if not exists public.scan_alerts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(id) on delete cascade,
  name             text not null,
  filters          jsonb not null default '{}'::jsonb,
  sort_by          text not null default 'volume_ratio',
  sort_order       text not null default 'desc' check (sort_order in ('asc', 'desc')),
  is_active        boolean not null default true,
  last_run_at      timestamptz,
  last_match_count integer not null default 0,
  last_run_status  text not null default 'waiting' check (last_run_status in ('waiting', 'success', 'skipped', 'failed')),
  last_error       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.scan_alert_matches (
  id            uuid primary key default gen_random_uuid(),
  alert_id      uuid not null references public.scan_alerts(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  run_date      date not null,
  symbols       jsonb not null default '[]'::jsonb,
  match_count   integer not null default 0,
  run_status    text not null default 'success' check (run_status in ('success', 'skipped', 'failed')),
  error_message text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (alert_id, run_date)
);

alter table public.scan_alerts enable row level security;
alter table public.scan_alert_matches enable row level security;

drop policy if exists "Users manage own scan_alerts" on public.scan_alerts;
create policy "Users manage own scan_alerts" on public.scan_alerts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage own scan_alert_matches" on public.scan_alert_matches;
create policy "Users manage own scan_alert_matches" on public.scan_alert_matches
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists scan_alerts_user_active_idx
  on public.scan_alerts(user_id, is_active);

create index if not exists scan_alert_matches_user_run_date_idx
  on public.scan_alert_matches(user_id, run_date desc);

create index if not exists scan_alert_matches_alert_run_date_idx
  on public.scan_alert_matches(alert_id, run_date desc);
