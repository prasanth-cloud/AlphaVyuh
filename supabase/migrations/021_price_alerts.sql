-- Price alerts: notify user when a stock crosses a price threshold
create table if not exists public.price_alerts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  symbol        text not null,
  condition     text not null check (condition in ('above', 'below')),
  target_price  numeric(12,2) not null,
  note          text,
  is_active     boolean not null default true,
  triggered_at  timestamptz,
  created_at    timestamptz not null default now()
);

alter table public.price_alerts enable row level security;

create policy "Users manage own price_alerts" on public.price_alerts
  for all using (auth.uid() = user_id);

create index if not exists price_alerts_user_idx   on public.price_alerts(user_id);
create index if not exists price_alerts_symbol_idx on public.price_alerts(symbol, is_active);
