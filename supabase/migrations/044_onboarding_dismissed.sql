alter table public.users add column if not exists onboarding_dismissed boolean not null default false;
