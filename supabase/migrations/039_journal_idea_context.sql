-- Persist the original idea context on live journal rows.
-- Supabase CLI is unavailable in this environment, so this migration follows
-- the repo's existing numbered migration sequence.

alter table public.trade_journal
  add column if not exists source_page text,
  add column if not exists source_context text,
  add column if not exists scanner_context jsonb,
  add column if not exists thesis text,
  add column if not exists invalidation_rule text;

alter table public.trade_journal
  drop constraint if exists trade_journal_source_page_check,
  add constraint trade_journal_source_page_check
  check (source_page is null or source_page in ('chart', 'watchlist', 'scanner', 'manual'));

alter table public.trade_journal
  drop constraint if exists trade_journal_scanner_context_object_check,
  add constraint trade_journal_scanner_context_object_check
  check (scanner_context is null or jsonb_typeof(scanner_context) = 'object');

alter table public.workflow_states
  add column if not exists scanner_context jsonb;

alter table public.workflow_states
  drop constraint if exists workflow_states_scanner_context_object_check,
  add constraint workflow_states_scanner_context_object_check
  check (scanner_context is null or jsonb_typeof(scanner_context) = 'object');
