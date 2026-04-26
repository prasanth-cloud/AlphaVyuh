-- Launch readiness: founder beta intake, invite codes, and chart defaults.

alter table public.waitlist
  add column if not exists source text not null default 'landing',
  add column if not exists invite_code text,
  add column if not exists status text not null default 'new'
    check (status in ('new', 'invited', 'onboarded', 'rejected')),
  add column if not exists notes text;

create table if not exists public.invite_codes (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  email      text,
  plan       text not null default 'founder',
  max_uses   integer not null default 1 check (max_uses > 0),
  uses       integer not null default 0 check (uses >= 0),
  disabled   boolean not null default false,
  expires_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_invite_codes_code on public.invite_codes(code);
create index if not exists idx_waitlist_created_at on public.waitlist(created_at desc);
