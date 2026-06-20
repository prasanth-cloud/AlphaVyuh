create table if not exists public.journal_ai_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.journal_ai_reviews enable row level security;
create policy "Users read own reviews" on public.journal_ai_reviews
  for select using (auth.uid() = user_id);
create policy "Service writes reviews" on public.journal_ai_reviews
  for insert with check (true);
