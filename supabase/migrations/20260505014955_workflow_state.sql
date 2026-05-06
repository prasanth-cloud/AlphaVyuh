create table if not exists public.workflow_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  watchlist_id uuid references public.watchlists(id) on delete set null,
  source text not null default 'manual',
  lifecycle text not null default 'idea',
  setup_type text,
  entry numeric,
  stop numeric,
  target numeric,
  position_size numeric,
  timeframe text not null default 'D',
  thesis text,
  invalidation_rule text,
  confidence int,
  setup_quality int,
  notes text,
  tags text[] not null default '{}',
  pinned boolean not null default false,
  review_later boolean not null default false,
  ignored boolean not null default false,
  broker_order_id text,
  journal_id uuid references public.trade_journal(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, symbol)
);

alter table public.workflow_states enable row level security;

drop policy if exists "Users can manage own workflow states" on public.workflow_states;
create policy "Users can manage own workflow states" on public.workflow_states
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.workflow_states
  drop constraint if exists workflow_states_lifecycle_check,
  add constraint workflow_states_lifecycle_check check (
    lifecycle in ('idea', 'watch', 'ready', 'triggered', 'open', 'closed', 'reviewed', 'invalidated', 'ignored', 'review_later')
  );

alter table public.workflow_states
  drop constraint if exists workflow_states_confidence_check,
  add constraint workflow_states_confidence_check check (confidence is null or (confidence >= 1 and confidence <= 5));

alter table public.workflow_states
  drop constraint if exists workflow_states_quality_check,
  add constraint workflow_states_quality_check check (setup_quality is null or (setup_quality >= 1 and setup_quality <= 5));

create index if not exists idx_workflow_states_user_lifecycle
  on public.workflow_states (user_id, lifecycle, updated_at desc);

create index if not exists idx_workflow_states_user_watchlist
  on public.workflow_states (user_id, watchlist_id, updated_at desc);

create or replace function public.workflow_states_set_updated_at()
returns trigger as $$
begin
  new.symbol = upper(new.symbol);
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists workflow_states_updated_at on public.workflow_states;
create trigger workflow_states_updated_at
  before insert or update on public.workflow_states
  for each row execute function public.workflow_states_set_updated_at();
