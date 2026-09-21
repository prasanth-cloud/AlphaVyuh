-- Durable, owner-scoped reconciliation records for broker fills that cannot
-- be matched to an existing journal position during import.
--
-- This is intentionally separate from trade_journal: an unmatched broker fill
-- is evidence that needs a human decision, not a fabricated trade close.

create table if not exists public.broker_fill_reconciliations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  broker text not null
    check (broker in ('zerodha', 'upstox')),
  broker_order_id text not null,
  symbol text not null,
  side text not null
    check (side in ('BUY', 'SELL')),
  filled_quantity integer not null
    check (filled_quantity > 0),
  average_price numeric(18, 4) not null
    check (average_price > 0),
  executed_at timestamptz,
  status text not null default 'needs_review'
    check (status in ('needs_review', 'linked', 'dismissed')),
  setup_id uuid,
  journal_id uuid,
  resolution_note text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint broker_fill_reconciliations_resolution_note_length
    check (resolution_note is null or char_length(resolution_note) <= 500),
  constraint broker_fill_reconciliations_user_setup_fkey
    foreign key (user_id, setup_id)
    references public.setups (user_id, id)
    on delete set null (setup_id),
  constraint broker_fill_reconciliations_user_journal_fkey
    foreign key (user_id, journal_id)
    references public.trade_journal (user_id, id)
    on delete set null (journal_id)
);

alter table public.broker_fill_reconciliations enable row level security;

drop policy if exists broker_fill_reconciliations_owner_read
  on public.broker_fill_reconciliations;
create policy broker_fill_reconciliations_owner_read
  on public.broker_fill_reconciliations
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Browser clients may read their own records but cannot create or resolve
-- broker evidence. Backend service-role code owns those writes.
revoke all on table public.broker_fill_reconciliations from anon;
revoke insert, update, delete on table public.broker_fill_reconciliations from authenticated;
grant select on table public.broker_fill_reconciliations to authenticated;

create unique index if not exists broker_fill_reconciliations_identity_idx
  on public.broker_fill_reconciliations (user_id, broker, broker_order_id);

create index if not exists broker_fill_reconciliations_review_queue_idx
  on public.broker_fill_reconciliations (user_id, status, last_seen_at desc);

create index if not exists broker_fill_reconciliations_symbol_idx
  on public.broker_fill_reconciliations (user_id, symbol, status, last_seen_at desc);

create or replace function public.broker_fill_reconciliations_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists broker_fill_reconciliations_updated_at
  on public.broker_fill_reconciliations;
create trigger broker_fill_reconciliations_updated_at
  before update on public.broker_fill_reconciliations
  for each row execute function public.broker_fill_reconciliations_set_updated_at();

comment on table public.broker_fill_reconciliations is
  'Owner-scoped broker fills awaiting an explicit journal or setup reconciliation decision.';

comment on column public.broker_fill_reconciliations.resolution_note is
  'Short human explanation for a link or dismissal. Never store broker payloads or credentials.';
