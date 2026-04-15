-- Saved chart layouts per user+symbol
create table if not exists public.chart_layouts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  symbol        text not null,
  timeframe     text not null default 'D',
  indicators    text[] not null default '{}',
  drawing_tools jsonb not null default '[]',
  updated_at    timestamptz not null default now(),
  unique (user_id, symbol)
);

alter table public.chart_layouts enable row level security;
create policy "Users can manage own layouts" on public.chart_layouts
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
