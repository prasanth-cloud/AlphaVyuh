-- Add onboarding_dismissed flag and first_scan_at timestamp to users table
-- Used by FirstRunBanner to persist dismissal and detect zero scanner runs
alter table public.users
  add column if not exists onboarding_dismissed boolean not null default false;

alter table public.users
  add column if not exists first_scan_at timestamptz;
