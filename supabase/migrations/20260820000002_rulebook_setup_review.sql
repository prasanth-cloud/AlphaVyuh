-- Reusable setup rules and recorded pre-order evaluations.
-- Rule evaluation is deliberately appendable: the rulebook and the exact
-- inputs/results used for each evaluation are retained for later review.

create table if not exists public.rulebooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  min_planned_rr numeric,
  max_risk_amount numeric,
  max_account_risk_pct numeric,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rulebooks_name_check check (length(trim(name)) between 1 and 120),
  constraint rulebooks_min_rr_check check (min_planned_rr is null or min_planned_rr > 0),
  constraint rulebooks_max_risk_check check (max_risk_amount is null or max_risk_amount >= 0),
  constraint rulebooks_max_account_pct_check check (max_account_risk_pct is null or (max_account_risk_pct >= 0 and max_account_risk_pct <= 100))
);

alter table public.rulebooks enable row level security;

drop policy if exists rulebooks_owner on public.rulebooks;
create policy rulebooks_owner
  on public.rulebooks
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter table public.rulebooks
  add constraint rulebooks_user_id_id_key unique (user_id, id);

create index if not exists rulebooks_user_active_idx
  on public.rulebooks (user_id, active, is_default, updated_at desc);

create table if not exists public.rulebook_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  rulebook_id uuid not null,
  code text not null,
  label text not null,
  severity text not null default 'check',
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rulebook_rules_severity_check check (severity in ('block', 'warn', 'check', 'info')),
  constraint rulebook_rules_config_object_check check (jsonb_typeof(config) = 'object'),
  constraint rulebook_rules_code_check check (length(trim(code)) between 1 and 80),
  constraint rulebook_rules_label_check check (length(trim(label)) between 1 and 160),
  constraint rulebook_rules_user_rulebook_fkey
    foreign key (user_id, rulebook_id)
    references public.rulebooks (user_id, id)
    on delete cascade,
  constraint rulebook_rules_unique_code unique (rulebook_id, code)
);

alter table public.rulebook_rules enable row level security;

drop policy if exists rulebook_rules_owner on public.rulebook_rules;
create policy rulebook_rules_owner
  on public.rulebook_rules
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists rulebook_rules_user_rulebook_idx
  on public.rulebook_rules (user_id, rulebook_id, enabled, sort_order);

create table if not exists public.setup_rule_evaluations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  setup_id uuid not null,
  rulebook_id uuid not null,
  overall_status text not null,
  can_proceed boolean not null default false,
  override_reason text,
  input_snapshot jsonb not null default '{}'::jsonb,
  results jsonb not null default '[]'::jsonb,
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint setup_rule_evaluations_status_check check (overall_status in ('passed', 'warned', 'blocked')),
  constraint setup_rule_evaluations_input_object_check check (jsonb_typeof(input_snapshot) = 'object'),
  constraint setup_rule_evaluations_results_array_check check (jsonb_typeof(results) = 'array'),
  constraint setup_rule_evaluations_user_setup_fkey
    foreign key (user_id, setup_id)
    references public.setups (user_id, id)
    on delete cascade,
  constraint setup_rule_evaluations_user_rulebook_fkey
    foreign key (user_id, rulebook_id)
    references public.rulebooks (user_id, id)
    on delete cascade,
  constraint setup_rule_evaluations_unique_run unique (user_id, setup_id, rulebook_id)
);

alter table public.setup_rule_evaluations enable row level security;

drop policy if exists setup_rule_evaluations_owner on public.setup_rule_evaluations;
create policy setup_rule_evaluations_owner
  on public.setup_rule_evaluations
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists setup_rule_evaluations_user_setup_idx
  on public.setup_rule_evaluations (user_id, setup_id, evaluated_at desc);

alter table public.setups
  add column if not exists rulebook_id uuid,
  add column if not exists review_status text not null default 'not_evaluated',
  add column if not exists last_reviewed_at timestamptz;

alter table public.setups
  drop constraint if exists setups_review_status_check;

alter table public.setups
  add constraint setups_review_status_check
  check (review_status in ('not_evaluated', 'passed', 'warned', 'blocked'));

alter table public.setups
  drop constraint if exists setups_user_rulebook_fkey;

alter table public.setups
  add constraint setups_user_rulebook_fkey
  foreign key (user_id, rulebook_id)
  references public.rulebooks (user_id, id)
  on delete set null;

create index if not exists setups_user_review_status_idx
  on public.setups (user_id, review_status, updated_at desc);

create or replace function public.rulebooks_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists rulebooks_updated_at on public.rulebooks;
create trigger rulebooks_updated_at
  before update on public.rulebooks
  for each row execute function public.rulebooks_set_updated_at();

drop trigger if exists rulebook_rules_updated_at on public.rulebook_rules;
create trigger rulebook_rules_updated_at
  before update on public.rulebook_rules
  for each row execute function public.rulebooks_set_updated_at();

comment on table public.rulebooks is
  'User-owned reusable setup discipline rules and risk budget configuration.';

comment on table public.setup_rule_evaluations is
  'Recorded input and result of the rulebook evaluation used before setup review or order capture.';
