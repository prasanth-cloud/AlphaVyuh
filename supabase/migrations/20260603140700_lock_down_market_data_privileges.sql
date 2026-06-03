-- Make market-data privileges explicit.
--
-- Public roles may read market-data tables/views used by public charts,
-- scanners, and recovery surfaces. Market-data writes and mutating definer RPCs
-- stay service-role only.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'stock_universe',
    'daily_ohlcv',
    'weekly_ohlcv',
    'ingest_runs',
    'bhavcopy_ingestion_log',
    'corporate_actions'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format(
        'revoke insert, update, delete, truncate, references, trigger on table public.%I from anon, authenticated',
        table_name
      );
      execute format('grant select on table public.%I to anon, authenticated', table_name);
      execute format('grant all on table public.%I to service_role', table_name);
    end if;
  end loop;

  if to_regclass('public.data_health') is not null then
    revoke all on table public.data_health from anon, authenticated;
    grant select on table public.data_health to anon, authenticated, service_role;
  end if;
end $$;

drop function if exists public.compute_rs_rating_for_date(date);

create or replace function public.compute_rs_score_for_date(p_trade_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with momentum as (
    select
      symbol,
      trade_date,
      close,
      lag(close, 252) over (partition by symbol order by trade_date) as close_252d_ago
    from daily_ohlcv
    where trade_date <= p_trade_date
  ),
  ranked as (
    select
      symbol,
      case
        when close_252d_ago is not null and close_252d_ago > 0
        then round(
          percent_rank() over (
            order by (close - close_252d_ago) / close_252d_ago
          ) * 98 + 1
        )::integer
      end as rs_score
    from momentum
    where trade_date = p_trade_date
  )
  update daily_ohlcv d
  set rs_score = r.rs_score
  from ranked r
  where d.symbol = r.symbol
    and d.trade_date = p_trade_date
    and r.rs_score is not null;
end;
$$;

revoke execute on function public.compute_rs_score_for_date(date) from public, anon, authenticated;
grant execute on function public.compute_rs_score_for_date(date) to service_role;

revoke execute on function public.resolve_market_symbol(text) from public, anon, authenticated;
grant execute on function public.resolve_market_symbol(text) to service_role;

revoke execute on function public.get_adjusted_candles(text, date, date, int, boolean) from public, anon, authenticated;
grant execute on function public.get_adjusted_candles(text, date, date, int, boolean) to service_role;

revoke execute on function public.market_data_coverage_audit(int) from public, anon, authenticated;
grant execute on function public.market_data_coverage_audit(int) to service_role;

revoke execute on function public.get_vcp_lookback(text[], date, int) from public, anon, authenticated;
grant execute on function public.get_vcp_lookback(text[], date, int) to service_role;
