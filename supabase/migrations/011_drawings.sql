-- Chart drawings (trendlines, horizontal lines, etc.)
create table if not exists public.drawings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  symbol     text not null,
  timeframe  text not null default 'D',
  tool_type  text not null,
  points     jsonb not null default '[]',
  style      jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.drawings enable row level security;
create policy "Users can manage own drawings" on public.drawings
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_drawings_user_symbol on public.drawings(user_id, symbol, timeframe);
