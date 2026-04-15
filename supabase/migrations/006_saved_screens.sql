-- User-saved scanner screens
create table if not exists public.saved_screens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  name       text not null,
  filters    jsonb not null default '{}',
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.saved_screens enable row level security;
create policy "Users can manage own screens" on public.saved_screens
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
