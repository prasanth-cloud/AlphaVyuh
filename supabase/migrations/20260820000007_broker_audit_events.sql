-- Durable, owner-scoped audit events for broker actions.
--
-- The broker order table is the lifecycle ledger. This table is the append-only
-- event trail used to answer who requested an action, what safety boundary was
-- evaluated, and what the broker reported afterward. It must never contain
-- credentials or raw broker responses.

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  event_type text not null,
  outcome text not null default 'recorded'
    check (outcome in ('recorded', 'accepted', 'blocked', 'submitted', 'reconciled', 'failed', 'deduplicated')),
  actor_type text not null default 'user'
    check (actor_type in ('user', 'system', 'broker')),
  broker text,
  broker_order_id text,
  idempotency_key text,
  setup_id uuid,
  journal_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_logs_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint audit_logs_user_setup_fkey
    foreign key (user_id, setup_id)
    references public.setups (user_id, id)
    on delete set null (setup_id),
  constraint audit_logs_user_journal_fkey
    foreign key (user_id, journal_id)
    references public.trade_journal (user_id, id)
    on delete set null (journal_id)
);

alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_owner_read on public.audit_logs;
create policy audit_logs_owner_read
  on public.audit_logs
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.audit_logs from anon;
revoke insert, update, delete on table public.audit_logs from authenticated;
grant select on table public.audit_logs to authenticated;

create index if not exists audit_logs_user_created_idx
  on public.audit_logs (user_id, created_at desc);

create index if not exists audit_logs_user_order_idx
  on public.audit_logs (user_id, broker_order_id, created_at desc)
  where broker_order_id is not null;

create index if not exists audit_logs_user_setup_idx
  on public.audit_logs (user_id, setup_id, created_at desc)
  where setup_id is not null;

comment on table public.audit_logs is
  'Append-only, owner-scoped, secret-free event trail for broker and other safety-sensitive actions.';

comment on column public.audit_logs.metadata is
  'Redacted, bounded context only. Never store credentials, tokens, raw broker payloads, or secrets.';
