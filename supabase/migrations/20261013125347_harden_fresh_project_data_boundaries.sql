-- Close gaps found by replaying the canonical migrations into a fresh database.
-- All public reference reads remain available; private operational data stays
-- behind the backend's service-role boundary.

revoke create on schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
drop policy if exists "Public read symbol aliases" on public.symbol_aliases;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'stock_universe', 'daily_ohlcv', 'weekly_ohlcv', 'corporate_actions', 'symbol_aliases'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists "Public read market reference" on public.%I', table_name);
    execute format(
      'create policy "Public read market reference" on public.%I for select to anon, authenticated using (true)',
      table_name
    );
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select on table public.%I to anon, authenticated', table_name);
  end loop;

  foreach table_name in array array[
    'ingest_runs', 'bhavcopy_ingestion_log', 'referral_rewards', 'waitlist_emails',
    'broker_credentials', 'broker_credential_audit', 'order_idempotency',
    'feedback_reports', 'invite_codes', 'waitlist'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
  end loop;
end $$;

-- A policy named "Service writes reviews" previously applied to PUBLIC and
-- allowed anonymous inserts for any user_id. Only the backend creates reviews.
drop policy if exists "Service writes reviews" on public.journal_ai_reviews;
drop policy if exists "Users read own reviews" on public.journal_ai_reviews;
create policy "Users read own reviews" on public.journal_ai_reviews
  for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on table public.journal_ai_reviews from public, anon, authenticated;
grant select on table public.journal_ai_reviews to authenticated;

-- Broker order lifecycle fields are trusted by the backend's safety and
-- idempotency checks. Users may inspect their own rows, but only the backend
-- may create, update, or delete execution state.
drop policy if exists broker_orders_owner on public.broker_orders;
create policy broker_orders_owner on public.broker_orders
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Explicit grants make fresh projects independent of Supabase's configurable
-- automatic table grants. Existing RLS policies still determine row ownership.
revoke all on table
  public.saved_screens, public.watchlists, public.watchlist_items,
  public.chart_layouts, public.trade_journal, public.shared_screens,
  public.screen_upvotes, public.price_alerts, public.chart_workspaces,
  public.scan_alerts, public.scan_alert_matches, public.workflow_states,
  public.broker_orders
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.saved_screens, public.watchlists, public.watchlist_items,
  public.chart_layouts, public.trade_journal,
  public.shared_screens, public.screen_upvotes, public.price_alerts,
  public.chart_workspaces, public.scan_alerts, public.scan_alert_matches,
  public.workflow_states
to authenticated;

revoke all on table public.users, public.subscriptions, public.digest_logs,
  public.email_unsubscribe_tokens, public.payment_logs, public.broker_orders from public, anon, authenticated;
grant select on table public.users, public.subscriptions, public.digest_logs,
  public.email_unsubscribe_tokens, public.payment_logs, public.broker_orders to authenticated;
grant select on table public.shared_screens, public.symbol_aliases to anon, authenticated;

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Legacy automatic function grants can explicitly grant EXECUTE to anon and
-- authenticated. Revoking only PUBLIC does not remove those grants.
revoke execute on function
  public.get_encrypted_credential(uuid, text, text),
  public.delete_broker_credentials(uuid, text),
  public.compute_rs_score_for_date(date),
  public.resolve_market_symbol(text),
  public.get_adjusted_candles(text, date, date, integer, boolean),
  public.market_data_coverage_audit(integer),
  public.get_vcp_lookback(text[], date, integer),
  public.activate_razorpay_payment(uuid, text, text, text, text, text, integer, integer)
from public, anon, authenticated;
grant execute on function
  public.get_encrypted_credential(uuid, text, text),
  public.delete_broker_credentials(uuid, text),
  public.compute_rs_score_for_date(date),
  public.resolve_market_symbol(text),
  public.get_adjusted_candles(text, date, date, integer, boolean),
  public.market_data_coverage_audit(integer),
  public.get_vcp_lookback(text[], date, integer),
  public.activate_razorpay_payment(uuid, text, text, text, text, text, integer, integer)
to service_role;

-- The signup trigger must keep working with a fixed, non-user-controlled path.
alter function public.handle_new_user() set search_path = '';
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Supabase's optional automatic-RLS event trigger needs no client RPC access.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
