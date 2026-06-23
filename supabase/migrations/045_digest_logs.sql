create table if not exists public.digest_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  sent_at timestamptz not null default now(),
  status text not null,
  symbol_count int,
  error_message text
);
alter table public.digest_logs enable row level security;
create policy "Users read own digest logs" on public.digest_logs
  for select using (auth.uid() = user_id);
