-- Durable setup identity for the chart -> decision desk -> journal workflow.
-- The first slice keeps the existing symbol-keyed workflow state as a
-- compatibility index while new records gain a stable setup id.

create table if not exists public.setups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  status text not null default 'planned',
  direction text not null,
  strategy_tag text,
  entry_low numeric,
  entry_high numeric,
  stop_price numeric,
  target_price numeric,
  planned_risk_amount numeric,
  planned_quantity integer,
  planned_rr numeric,
  thesis text,
  invalidation_reason text,
  source text not null default 'manual',
  scanner_context jsonb,
  chart_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint setups_status_check check (status in ('planned', 'ready', 'triggered', 'open', 'closed', 'invalidated', 'cancelled')),
  constraint setups_direction_check check (direction in ('long', 'short')),
  constraint setups_source_check check (source in ('scanner', 'chart', 'watchlist', 'manual')),
  constraint setups_entry_range_check check (entry_low is null or entry_high is null or entry_high >= entry_low),
  constraint setups_quantity_check check (planned_quantity is null or planned_quantity > 0),
  constraint setups_risk_check check (planned_risk_amount is null or planned_risk_amount >= 0),
  constraint setups_rr_check check (planned_rr is null or planned_rr >= 0),
  constraint setups_scanner_context_object_check check (scanner_context is null or jsonb_typeof(scanner_context) = 'object'),
  constraint setups_chart_snapshot_object_check check (chart_snapshot is null or jsonb_typeof(chart_snapshot) = 'object')
);

alter table public.setups enable row level security;

drop policy if exists setups_owner on public.setups;
create policy setups_owner
  on public.setups
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists setups_user_updated_idx
  on public.setups (user_id, updated_at desc);

create index if not exists setups_user_symbol_status_idx
  on public.setups (user_id, symbol, status, updated_at desc);

-- Child records carry the same user_id as their parent setup. Keep that pair
-- unique so the foreign keys below enforce ownership at the database boundary,
-- including direct authenticated-table writes that bypass the FastAPI routes.
alter table public.setups
  add constraint setups_user_id_id_key unique (user_id, id);

create or replace function public.setups_set_updated_at()
returns trigger as $$
begin
  new.symbol = upper(new.symbol);
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists setups_updated_at on public.setups;
create trigger setups_updated_at
  before insert or update on public.setups
  for each row execute function public.setups_set_updated_at();

alter table public.workflow_states
  add column if not exists setup_id uuid;

alter table public.workflow_states
  drop constraint if exists workflow_states_setup_id_fkey;

alter table public.workflow_states
  add constraint workflow_states_user_setup_fkey
  foreign key (user_id, setup_id)
  references public.setups (user_id, id)
  on delete set null (setup_id);

alter table public.trade_journal
  add column if not exists setup_id uuid;

alter table public.trade_journal
  drop constraint if exists trade_journal_setup_id_fkey;

alter table public.trade_journal
  add constraint trade_journal_user_setup_fkey
  foreign key (user_id, setup_id)
  references public.setups (user_id, id)
  on delete set null (setup_id);

alter table public.broker_orders
  add column if not exists setup_id uuid;

alter table public.broker_orders
  drop constraint if exists broker_orders_setup_id_fkey;

alter table public.broker_orders
  add constraint broker_orders_user_setup_fkey
  foreign key (user_id, setup_id)
  references public.setups (user_id, id)
  on delete set null (setup_id);

create index if not exists workflow_states_user_setup_idx
  on public.workflow_states (user_id, setup_id, updated_at desc)
  where setup_id is not null;

create index if not exists trade_journal_user_setup_idx
  on public.trade_journal (user_id, setup_id, created_at desc)
  where setup_id is not null;

create index if not exists broker_orders_user_setup_idx
  on public.broker_orders (user_id, setup_id, placed_at desc)
  where setup_id is not null;

comment on table public.setups is
  'Durable user-owned trading plan identity shared by scanner, chart, workflow, broker, journal, and review slices.';

comment on column public.workflow_states.setup_id is
  'Optional durable setup identity; user_id,symbol remains the compatibility upsert key during migration.';
