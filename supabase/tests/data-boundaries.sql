-- The caller MUST wrap this test in a transaction and roll it back.
-- Tests use only synthetic users and data; no pgTAP extension is required.
create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is distinct from true then
    raise exception 'RLS verification failed: %', message;
  end if;
end $$;

create function pg_temp.assert_denied(statement text)
returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'RLS verification failed: forbidden operation succeeded';
exception when insufficient_privilege then
  return;
end $$;

select pg_temp.assert_true(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
), 'all public tables must enable RLS');

select pg_temp.assert_true(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('update_updated_at', 'chart_workspaces_set_updated_at',
      'workflow_states_set_updated_at', 'broker_credentials_set_updated_at')
    and not coalesce(p.proconfig @> array['search_path=""']::text[], false)
), 'row update triggers must have fixed search paths');

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    perform pg_temp.assert_true(
      not has_function_privilege('anon', 'public.rls_auto_enable()', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.rls_auto_enable()', 'EXECUTE'),
      'automatic RLS event trigger must not expose a client RPC'
    );
  end if;
end $$;

do $$
declare
  table_name text;
  client_role text;
  function_name text;
begin
  foreach table_name in array array[
    'broker_credentials', 'broker_credential_audit', 'order_idempotency',
    'feedback_reports', 'invite_codes', 'waitlist', 'waitlist_emails',
    'referral_rewards', 'ingest_runs', 'bhavcopy_ingestion_log'
  ] loop
    foreach client_role in array array['anon', 'authenticated'] loop
      perform pg_temp.assert_true(
        not has_table_privilege(client_role, 'public.' || table_name, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
        table_name || ' must deny direct client access'
      );
    end loop;
  end loop;
  foreach table_name in array array[
    'users', 'subscriptions', 'journal_ai_reviews', 'digest_logs',
    'email_unsubscribe_tokens', 'payment_logs', 'broker_orders'
  ] loop
    perform pg_temp.assert_true(has_table_privilege('authenticated', 'public.' || table_name, 'SELECT'),
      table_name || ' must allow authenticated reads');
  end loop;
  foreach table_name in array array['users', 'journal_ai_reviews', 'payment_logs', 'order_idempotency', 'broker_orders'] loop
    perform pg_temp.assert_true(not has_table_privilege('authenticated', 'public.' || table_name, 'INSERT,UPDATE,DELETE'),
      table_name || ' must remain server-owned');
  end loop;
  foreach table_name in array array[
    'stock_universe', 'daily_ohlcv', 'weekly_ohlcv', 'corporate_actions', 'symbol_aliases'
  ] loop
    foreach client_role in array array['anon', 'authenticated'] loop
      perform pg_temp.assert_true(has_table_privilege(client_role, 'public.' || table_name, 'SELECT'),
        table_name || ' must preserve public reference reads');
      perform pg_temp.assert_true(not has_table_privilege(client_role, 'public.' || table_name, 'INSERT,UPDATE,DELETE'),
        table_name || ' must deny client market-data writes');
    end loop;
  end loop;
  foreach function_name in array array[
    'public.get_encrypted_credential(uuid,text,text)',
    'public.delete_broker_credentials(uuid,text)',
    'public.compute_rs_score_for_date(date)',
    'public.resolve_market_symbol(text)',
    'public.get_adjusted_candles(text,date,date,integer,boolean)',
    'public.market_data_coverage_audit(integer)',
    'public.get_vcp_lookback(text[],date,integer)',
    'public.activate_razorpay_payment(uuid,text,text,text,text,text,integer,integer)'
  ] loop
    foreach client_role in array array['anon', 'authenticated'] loop
      perform pg_temp.assert_true(not has_function_privilege(client_role, function_name, 'EXECUTE'),
        function_name || ' must deny direct client execution');
    end loop;
    perform pg_temp.assert_true(has_function_privilege('service_role', function_name, 'EXECUTE'),
      function_name || ' must preserve service execution');
  end loop;
end $$;

select pg_temp.assert_true(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
    and (has_table_privilege('anon', c.oid, 'TRUNCATE') or has_table_privilege('authenticated', c.oid, 'TRUNCATE'))
), 'client roles must never bypass RLS with TRUNCATE');

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1100000-0000-4000-8000-000000000001', 'rls-alice@example.invalid', '{"full_name":"RLS Alice"}'),
  ('b2200000-0000-4000-8000-000000000002', 'rls-bob@example.invalid', '{"full_name":"RLS Bob"}');
select pg_temp.assert_true((select count(*) = 2 from public.users where id in (
  'a1100000-0000-4000-8000-000000000001', 'b2200000-0000-4000-8000-000000000002'
)), 'signup trigger must create both profiles');

insert into public.watchlists (id, user_id, name) values
  ('a1100000-0000-4000-8000-000000000011', 'a1100000-0000-4000-8000-000000000001', 'Alice private list'),
  ('b2200000-0000-4000-8000-000000000022', 'b2200000-0000-4000-8000-000000000002', 'Bob private list');
insert into public.scan_alerts (id, user_id, name) values
  ('b2200000-0000-4000-8000-000000000033', 'b2200000-0000-4000-8000-000000000002', 'Bob alert');
insert into public.journal_ai_reviews (user_id, result) values
  ('a1100000-0000-4000-8000-000000000001', '{"source":"service"}'),
  ('b2200000-0000-4000-8000-000000000002', '{"source":"service"}');
insert into public.waitlist_emails (email) values ('rls-private@example.invalid');
insert into public.stock_universe (symbol, company_name) values ('RLS_AUDIT', 'Synthetic RLS Fixture');
insert into public.broker_orders (id, user_id, broker, symbol, side, quantity, order_type) values
  ('a1100000-0000-4000-8000-000000000044', 'a1100000-0000-4000-8000-000000000001', 'simulated', 'RLS_AUDIT', 'BUY', 1, 'MARKET');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.assert_denied('select * from public.waitlist_emails');
select pg_temp.assert_denied('select * from public.referral_rewards');
select pg_temp.assert_denied('insert into public.journal_ai_reviews(user_id,result) values (''b2200000-0000-4000-8000-000000000002'',''{}'')');
select pg_temp.assert_denied('select public.get_encrypted_credential(''b2200000-0000-4000-8000-000000000002'',''zerodha'',''api_key'')');
select pg_temp.assert_denied('select public.delete_broker_credentials(''b2200000-0000-4000-8000-000000000002'',''zerodha'')');
select pg_temp.assert_true((select count(*) = 1 from public.stock_universe where symbol = 'RLS_AUDIT'),
  'anonymous public-reference read must work');
select pg_temp.assert_denied('update public.stock_universe set company_name = ''forged'' where symbol = ''RLS_AUDIT''');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1100000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a1100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select pg_temp.assert_true((select count(*) = 1 and bool_and(id = 'a1100000-0000-4000-8000-000000000001') from public.users), 'Alice may read only her profile');
select pg_temp.assert_true((select count(*) = 1 from public.watchlists), 'Alice may read only her watchlists');
select pg_temp.assert_true((select count(*) = 1 and bool_and(user_id = 'a1100000-0000-4000-8000-000000000001') from public.journal_ai_reviews), 'Alice may read only her AI reviews');
select pg_temp.assert_true((select count(*) = 1 from public.broker_orders), 'Alice may inspect her broker order');
select pg_temp.assert_denied('update public.users set plan = ''elite''');
select pg_temp.assert_denied('select public.get_encrypted_credential(''b2200000-0000-4000-8000-000000000002'',''zerodha'',''api_key'')');
select pg_temp.assert_denied('select public.delete_broker_credentials(''b2200000-0000-4000-8000-000000000002'',''zerodha'')');
select pg_temp.assert_denied('insert into public.broker_orders(user_id,broker,symbol,side,quantity,order_type,status,raw_response) values (''a1100000-0000-4000-8000-000000000001'',''simulated'',''RLS_AUDIT'',''BUY'',1,''MARKET'',''COMPLETE'',''{"forged":true}'')');
select pg_temp.assert_denied('update public.broker_orders set status = ''COMPLETE'', raw_response = ''{"forged":true}'' where id = ''a1100000-0000-4000-8000-000000000044''');
select pg_temp.assert_denied('delete from public.broker_orders where id = ''a1100000-0000-4000-8000-000000000044''');
select pg_temp.assert_denied('insert into public.journal_ai_reviews(user_id,result) values (''a1100000-0000-4000-8000-000000000001'',''{}'')');
select pg_temp.assert_denied('insert into public.referral_rewards(referrer_id,referred_id,reward_days) values (''a1100000-0000-4000-8000-000000000001'',''b2200000-0000-4000-8000-000000000002'',9999)');
select pg_temp.assert_denied('insert into public.watchlist_items(watchlist_id,symbol) values (''b2200000-0000-4000-8000-000000000022'',''RLS_AUDIT'')');
select pg_temp.assert_denied('insert into public.scan_alert_matches(alert_id,user_id,run_date) values (''b2200000-0000-4000-8000-000000000033'',''a1100000-0000-4000-8000-000000000001'',current_date)');
insert into public.watchlist_items (watchlist_id, symbol) values ('a1100000-0000-4000-8000-000000000011', 'RLS_AUDIT');
update public.watchlists set name = 'Alice updated list' where id = 'a1100000-0000-4000-8000-000000000011';
select pg_temp.assert_true((select name = 'Alice updated list' from public.watchlists where id = 'a1100000-0000-4000-8000-000000000011'),
  'Alice own watchlist writes must work');
update public.watchlists set name = 'cross-user overwrite' where id = 'b2200000-0000-4000-8000-000000000022';
select pg_temp.assert_denied('update public.watchlists set user_id = ''b2200000-0000-4000-8000-000000000002'' where id = ''a1100000-0000-4000-8000-000000000011''');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2200000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"b2200000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select pg_temp.assert_true((select count(*) = 1 and bool_and(id = 'b2200000-0000-4000-8000-000000000002') from public.users), 'Bob may read only his profile');
select pg_temp.assert_true((select count(*) = 1 and bool_and(user_id = 'b2200000-0000-4000-8000-000000000002') from public.journal_ai_reviews), 'Bob may read only his AI reviews');
select pg_temp.assert_true((select count(*) = 1 from public.watchlists), 'Bob may read only his watchlists');
select pg_temp.assert_true((select name = 'Bob private list' from public.watchlists where id = 'b2200000-0000-4000-8000-000000000022'),
  'Alice cross-user update must not modify Bob list');
select pg_temp.assert_true((select count(*) = 0 from public.watchlist_items), 'Bob cannot read Alice watchlist item');
select pg_temp.assert_true((select count(*) = 0 from public.broker_orders), 'Bob cannot read Alice broker order');
reset role;

set local role service_role;
insert into public.broker_credentials (user_id, broker, key_name, key_value) values
  ('a1100000-0000-4000-8000-000000000001', 'zerodha', 'api_key', decode('00', 'hex'));
select pg_temp.assert_true(public.get_encrypted_credential('a1100000-0000-4000-8000-000000000001', 'zerodha', 'api_key') = decode('00', 'hex'),
  'service role may retrieve ciphertext');
select public.delete_broker_credentials('a1100000-0000-4000-8000-000000000001', 'zerodha');
select pg_temp.assert_true((select count(*) = 0 from public.broker_credentials where user_id = 'a1100000-0000-4000-8000-000000000001'),
  'service role may delete credentials');
insert into public.waitlist_emails (email) values ('rls-service@example.invalid');
insert into public.journal_ai_reviews (user_id, result) values
  ('a1100000-0000-4000-8000-000000000001', '{"source":"service-role"}');
insert into public.broker_orders (id, user_id, broker, symbol, side, quantity, order_type) values
  ('a1100000-0000-4000-8000-000000000055', 'a1100000-0000-4000-8000-000000000001', 'simulated', 'RLS_AUDIT', 'BUY', 1, 'MARKET');
update public.broker_orders set status = 'COMPLETE' where id = 'a1100000-0000-4000-8000-000000000044';
select pg_temp.assert_true((select status = 'COMPLETE' from public.broker_orders where id = 'a1100000-0000-4000-8000-000000000044'),
  'service role may reconcile broker order state');
delete from public.broker_orders where id = 'a1100000-0000-4000-8000-000000000055';
select pg_temp.assert_true((select count(*) = 2 from public.waitlist_emails where email like 'rls-%@example.invalid'),
  'service role must retain private-table access');
reset role;
