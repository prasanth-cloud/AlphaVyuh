-- Add email digest preference to users table
alter table public.users
  add column if not exists email_digest_enabled boolean not null default true;

-- Unsubscribe tokens for one-click unsubscribe (RFC 8058)
create table if not exists public.email_unsubscribe_tokens (
  token       text primary key default encode(gen_random_bytes(32), 'hex'),
  user_id     uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique(user_id)
);

alter table public.email_unsubscribe_tokens enable row level security;
create policy "Users can read own unsubscribe token"
  on public.email_unsubscribe_tokens for select using (auth.uid() = user_id);
