-- Add onboarding_dismissed flag to users table
-- Used by FirstRunBanner to persist dismissal across sessions
alter table public.users
  add column if not exists onboarding_dismissed boolean not null default false;
