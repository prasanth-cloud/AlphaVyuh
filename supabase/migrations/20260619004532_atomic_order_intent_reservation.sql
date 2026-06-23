-- Make one user order intent own at most one broker-order lifecycle row and
-- one Journal position. The backend still performs friendly preflight checks,
-- while these indexes are the final concurrency boundary.

-- broker_orders previously existed only in the backend migration directory.
-- Declare it in the canonical Supabase migration stream so fresh environments
-- receive the same lifecycle table before the uniqueness boundary is added.
create table if not exists public.broker_orders (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  broker text not null check (broker in ('simulated', 'zerodha', 'upstox')),
  broker_order_id text,
  journal_id uuid references public.trade_journal(id) on delete set null,
  symbol text not null,
  exchange text not null default 'NSE',
  side text not null check (side in ('BUY', 'SELL')),
  quantity integer not null check (quantity > 0),
  order_type text not null check (order_type in ('MARKET', 'LIMIT', 'SL', 'SL-M')),
  price numeric,
  trigger_price numeric,
  status text not null default 'PENDING',
  idempotency_key text,
  placed_at timestamptz not null default now(),
  raw_response jsonb not null default '{}'::jsonb
);

alter table public.broker_orders enable row level security;

drop policy if exists broker_orders_owner on public.broker_orders;
create policy broker_orders_owner
  on public.broker_orders
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists broker_orders_user_idx
  on public.broker_orders (user_id, placed_at desc);

create index if not exists broker_orders_user_broker_id_idx
  on public.broker_orders (user_id, broker, broker_order_id)
  where broker_order_id is not null;

alter table public.trade_journal
  add column if not exists order_intent_key uuid;

-- Backfill intents written by the pre-column implementation.
update public.trade_journal
set order_intent_key = (
  substring(
    entry_reason
    from '\[alphavyuh-order-intent:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\]'
  )
)::uuid
where order_intent_key is null
  and entry_reason ~ '\[alphavyuh-order-intent:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\]';

do $$
begin
  if exists (
    select 1
    from public.trade_journal
    where order_intent_key is not null
    group by user_id, order_intent_key
    having count(*) > 1
  ) then
    raise exception
      'Duplicate trade_journal order intents exist; reconcile them before applying atomic_order_intent_reservation';
  end if;
end
$$;

create unique index if not exists trade_journal_user_order_intent_unique
  on public.trade_journal (user_id, order_intent_key)
  where order_intent_key is not null;

do $$
begin
  if exists (
    select 1
    from public.broker_orders
    where idempotency_key is not null
    group by user_id, idempotency_key
    having count(*) > 1
  ) then
    raise exception
      'Duplicate broker_orders idempotency keys exist; reconcile them before applying atomic_order_intent_reservation';
  end if;
end
$$;

create unique index if not exists broker_orders_user_order_intent_unique
  on public.broker_orders (user_id, idempotency_key)
  where idempotency_key is not null;

comment on column public.trade_journal.order_intent_key is
  'Caller-generated UUID joining one order intent to at most one Journal position.';
