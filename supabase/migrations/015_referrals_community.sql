-- Phase 4+: referral system + billing_period + community features

-- 1. Referral columns on users
alter table public.users
  add column if not exists referral_code text unique,
  add column if not exists referred_by   uuid references public.users(id) on delete set null,
  add column if not exists billing_period text not null default 'monthly'
    check (billing_period in ('monthly', 'annual'));

create index if not exists idx_users_referral_code on public.users(referral_code) where referral_code is not null;

-- 2. Community: public shared screens
create table if not exists public.shared_screens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  screen_id   uuid not null references public.saved_screens(id) on delete cascade,
  title       text not null,
  description text,
  tags        text[] default '{}',
  upvotes     integer not null default 0,
  is_featured boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.shared_screens enable row level security;
create policy "Anyone can read shared screens" on public.shared_screens for select using (true);
create policy "Users can manage own shared screens" on public.shared_screens
  for all using (auth.uid() = user_id);

create index if not exists idx_shared_screens_upvotes on public.shared_screens(upvotes desc);
create index if not exists idx_shared_screens_user on public.shared_screens(user_id);
create index if not exists idx_shared_screens_featured on public.shared_screens(is_featured, created_at desc);

-- 3. Community upvotes (prevent double-voting)
create table if not exists public.screen_upvotes (
  user_id   uuid not null references public.users(id) on delete cascade,
  screen_id uuid not null references public.shared_screens(id) on delete cascade,
  primary key (user_id, screen_id)
);

alter table public.screen_upvotes enable row level security;
create policy "Users can manage own upvotes" on public.screen_upvotes
  for all using (auth.uid() = user_id);

-- 4. Referral rewards log (so we can track who got what)
create table if not exists public.referral_rewards (
  id            uuid primary key default gen_random_uuid(),
  referrer_id   uuid not null references public.users(id) on delete cascade,
  referred_id   uuid not null references public.users(id) on delete cascade,
  reward_type   text not null default 'plan_extension', -- 'plan_extension'
  reward_days   integer not null default 30,
  applied_at    timestamptz not null default now(),
  unique (referrer_id, referred_id)
);
