create table if not exists public.workflow_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.workflow_states enable row level security;

drop policy if exists "Users can read own workflow state" on public.workflow_states;
create policy "Users can read own workflow state"
  on public.workflow_states
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own workflow state" on public.workflow_states;
create policy "Users can insert own workflow state"
  on public.workflow_states
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own workflow state" on public.workflow_states;
create policy "Users can update own workflow state"
  on public.workflow_states
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own workflow state" on public.workflow_states;
create policy "Users can delete own workflow state"
  on public.workflow_states
  for delete
  using (auth.uid() = user_id);

create or replace function public.set_workflow_states_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workflow_states_updated_at on public.workflow_states;
create trigger workflow_states_updated_at
  before update on public.workflow_states
  for each row
  execute function public.set_workflow_states_updated_at();
