-- Durable EOD scanner definitions, runs, and candidate lineage.
--
-- Scanner results are user-owned workflow evidence. Market-data rows remain
-- shared reference data, while each run stores the user's input, the EOD date,
-- explainability fields, and a compact result snapshot that can be converted
-- into a setup without retyping the original scan context.

create table if not exists public.scanner_definitions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  universe text not null default 'all_nse'
    check (universe in ('all_nse', 'nifty500', 'nifty_midsmallcap_400', 'custom')),
  definition jsonb not null default '{}'::jsonb
    check (jsonb_typeof(definition) = 'object'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table if not exists public.scanner_filter_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scanner_definition_id uuid not null,
  operator text not null default 'and' check (operator in ('and', 'or')),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, id),
  constraint scanner_filter_groups_definition_owner_fkey
    foreign key (user_id, scanner_definition_id)
    references public.scanner_definitions (user_id, id)
    on delete cascade
);

create table if not exists public.scanner_filters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null,
  kind text not null check (char_length(trim(kind)) between 1 and 80),
  value jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, id),
  constraint scanner_filters_group_owner_fkey
    foreign key (user_id, group_id)
    references public.scanner_filter_groups (user_id, id)
    on delete cascade
);

create table if not exists public.scanner_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scanner_definition_id uuid,
  preset_id text,
  input_definition jsonb not null default '{}'::jsonb
    check (jsonb_typeof(input_definition) = 'object'),
  trade_date date not null,
  status text not null default 'completed'
    check (status in ('running', 'completed', 'partial', 'failed')),
  total_matches integer not null default 0 check (total_matches >= 0),
  result_count integer not null default 0 check (result_count >= 0),
  source_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_metadata) = 'object'),
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  constraint scanner_runs_definition_owner_fkey
    foreign key (user_id, scanner_definition_id)
    references public.scanner_definitions (user_id, id)
    on delete set null (scanner_definition_id)
);

create table if not exists public.scanner_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scanner_run_id uuid not null,
  symbol text not null,
  rank integer not null check (rank > 0),
  status text not null default 'new'
    check (status in ('new', 'shortlisted', 'ignored', 'converted')),
  matched_conditions jsonb not null default '{}'::jsonb
    check (jsonb_typeof(matched_conditions) = 'object'),
  result_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(result_snapshot) = 'object'),
  setup_id uuid,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, scanner_run_id, symbol),
  constraint scanner_candidates_run_owner_fkey
    foreign key (user_id, scanner_run_id)
    references public.scanner_runs (user_id, id)
    on delete cascade,
  constraint scanner_candidates_setup_owner_fkey
    foreign key (user_id, setup_id)
    references public.setups (user_id, id)
    on delete set null (setup_id)
);

create or replace function public.scanner_definitions_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists scanner_definitions_updated_at on public.scanner_definitions;
create trigger scanner_definitions_updated_at
  before update on public.scanner_definitions
  for each row execute function public.scanner_definitions_set_updated_at();

alter table public.setups
  add column if not exists source_scanner_candidate_id uuid;

alter table public.setups
  drop constraint if exists setups_source_scanner_candidate_fkey;

alter table public.setups
  add constraint setups_source_scanner_candidate_fkey
  foreign key (user_id, source_scanner_candidate_id)
  references public.scanner_candidates (user_id, id)
  on delete set null (source_scanner_candidate_id);

alter table public.scanner_definitions enable row level security;
alter table public.scanner_filter_groups enable row level security;
alter table public.scanner_filters enable row level security;
alter table public.scanner_runs enable row level security;
alter table public.scanner_candidates enable row level security;

drop policy if exists scanner_definitions_owner on public.scanner_definitions;
create policy scanner_definitions_owner
  on public.scanner_definitions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists scanner_filter_groups_owner on public.scanner_filter_groups;
create policy scanner_filter_groups_owner
  on public.scanner_filter_groups
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists scanner_filters_owner on public.scanner_filters;
create policy scanner_filters_owner
  on public.scanner_filters
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists scanner_runs_owner on public.scanner_runs;
create policy scanner_runs_owner
  on public.scanner_runs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists scanner_candidates_owner on public.scanner_candidates;
create policy scanner_candidates_owner
  on public.scanner_candidates
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists scanner_definitions_user_active_idx
  on public.scanner_definitions (user_id, is_active, updated_at desc);

create index if not exists scanner_filter_groups_definition_idx
  on public.scanner_filter_groups (user_id, scanner_definition_id, sort_order);

create index if not exists scanner_filters_group_idx
  on public.scanner_filters (user_id, group_id, sort_order);

create index if not exists scanner_runs_user_trade_date_idx
  on public.scanner_runs (user_id, trade_date desc, created_at desc);

create index if not exists scanner_candidates_run_rank_idx
  on public.scanner_candidates (user_id, scanner_run_id, rank);

create index if not exists scanner_candidates_setup_idx
  on public.scanner_candidates (user_id, setup_id)
  where setup_id is not null;

create index if not exists setups_source_scanner_candidate_idx
  on public.setups (user_id, source_scanner_candidate_id)
  where source_scanner_candidate_id is not null;

comment on table public.scanner_runs is
  'User-owned EOD scanner executions with the exact input and source date used.';

comment on table public.scanner_candidates is
  'Explainable scanner result snapshots that can become durable trading setups.';

comment on column public.scanner_candidates.result_snapshot is
  'Compact EOD result snapshot; it is evidence for the run, not a live quote.';
