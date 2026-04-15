-- Razorpay subscription tracking
create table if not exists public.subscriptions (
  id                   text primary key,
  user_id              uuid not null references public.users(id) on delete cascade,
  plan                 text not null,
  status               text not null,
  razorpay_sub_id      text,
  razorpay_order_id    text,
  current_period_start timestamptz,
  current_period_end   timestamptz,
  created_at           timestamptz not null default now()
);

alter table public.subscriptions enable row level security;
create policy "Users can read own subscriptions" on public.subscriptions for select using (auth.uid() = user_id);
