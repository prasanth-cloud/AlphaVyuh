-- Data quality foundation: symbol aliases, adjusted candles, fast coverage audit.
--
-- Market data tables are public/reference data, not user-owned data. RLS remains
-- disabled here; do not copy this pattern to watchlists, journals, broker data,
-- or any user-scoped table.

set statement_timeout = '0';

-- Current symbol identity mapping for renamed/merged NSE symbols.
create table if not exists public.symbol_aliases (
  alias_symbol text primary key,
  current_symbol text not null references public.stock_universe(symbol) on delete cascade,
  alias_type text not null default 'rename'
    check (alias_type in ('rename', 'merger', 'demerger', 'isin_change', 'operator')),
  valid_from date,
  valid_to date,
  source text not null default 'operator',
  confidence numeric(4,2) not null default 1.00 check (confidence >= 0 and confidence <= 1),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists symbol_aliases_current_symbol_idx
  on public.symbol_aliases(current_symbol);

alter table public.symbol_aliases disable row level security;
grant select on public.symbol_aliases to anon, authenticated, service_role;

-- Resolve either a live stock_universe symbol or an old alias into a current
-- stock_universe symbol.
create or replace function public.resolve_market_symbol(p_symbol text)
returns table (
  requested_symbol text,
  current_symbol text,
  was_alias boolean,
  alias_type text,
  notes text
)
language sql
stable
security definer
set search_path = public
as $$
  with normalized as (
    select upper(trim(p_symbol)) as symbol
  ),
  exact_match as (
    select
      n.symbol as requested_symbol,
      su.symbol as current_symbol,
      false as was_alias,
      null::text as alias_type,
      null::text as notes
    from normalized n
    join stock_universe su on su.symbol = n.symbol
    limit 1
  ),
  alias_match as (
    select
      n.symbol as requested_symbol,
      sa.current_symbol,
      true as was_alias,
      sa.alias_type,
      sa.notes
    from normalized n
    join symbol_aliases sa on sa.alias_symbol = n.symbol
    join stock_universe su on su.symbol = sa.current_symbol
    where not exists (select 1 from exact_match)
    order by sa.confidence desc, sa.updated_at desc
    limit 1
  )
  select * from exact_match
  union all
  select * from alias_match;
$$;

grant execute on function public.resolve_market_symbol(text)
  to anon, authenticated, service_role;

-- Return split/bonus adjusted OHLCV for a single symbol. The factor is derived
-- from corporate_actions rows whose ratio is an adjustment multiplier.
--
-- Price fields are adjusted backwards: historical prices before a split are
-- divided by the cumulative future action factor. Volume is multiplied by the
-- same factor. If no action rows exist, adjustment_factor is 1.0 and output is
-- identical to raw daily_ohlcv.
create or replace function public.get_adjusted_candles(
  p_symbol text,
  p_from_date date default null,
  p_to_date date default null,
  p_limit int default 3000,
  p_adjust boolean default true
)
returns table (
  symbol text,
  requested_symbol text,
  trade_date date,
  open numeric,
  high numeric,
  low numeric,
  close numeric,
  prev_close numeric,
  volume bigint,
  adjustment_factor numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with resolved as (
    select *
    from resolve_market_symbol(p_symbol)
    limit 1
  ),
  raw_rows as (
    select d.*
    from daily_ohlcv d
    join resolved r on r.current_symbol = d.symbol
    where (p_from_date is null or d.trade_date >= p_from_date)
      and (p_to_date is null or d.trade_date <= p_to_date)
    order by d.trade_date desc
    limit least(greatest(coalesce(p_limit, 3000), 1), 3000)
  ),
  oldest_first as (
    select *
    from raw_rows
    order by trade_date asc
  ),
  factored as (
    select
      b.*,
      case
        when p_adjust then coalesce((
          select exp(sum(ln(ca.ratio)))::numeric
          from corporate_actions ca
          where ca.symbol = b.symbol
            and ca.action_type in ('split', 'bonus')
            and ca.ratio is not null
            and ca.ratio > 0
            and ca.action_date > b.trade_date
            and ca.action_date <= coalesce(p_to_date, current_date)
        ), 1::numeric)
        else 1::numeric
      end as factor
    from oldest_first b
  )
  select
    f.symbol,
    (select requested_symbol from resolved) as requested_symbol,
    f.trade_date,
    round((f.open / nullif(f.factor, 0))::numeric, 4) as open,
    round((f.high / nullif(f.factor, 0))::numeric, 4) as high,
    round((f.low / nullif(f.factor, 0))::numeric, 4) as low,
    round((f.close / nullif(f.factor, 0))::numeric, 4) as close,
    case when f.prev_close is null then null else round((f.prev_close / nullif(f.factor, 0))::numeric, 4) end as prev_close,
    round((f.volume * f.factor))::bigint as volume,
    round(f.factor, 8) as adjustment_factor
  from factored f;
$$;

grant execute on function public.get_adjusted_candles(text, date, date, int, boolean)
  to anon, authenticated, service_role;

-- Fast database-side replacement for scripts/audit_market_data_coverage.py.
create or replace function public.market_data_coverage_audit(p_years int default 5)
returns table (
  active_nse_eq_symbols integer,
  window_start date,
  latest_covered_trade_date date,
  symbols_on_latest_date integer,
  chart_ready_symbols integer,
  partial_history_symbols integer,
  missing_history_symbols integer
)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      (current_date - make_interval(days => (365 * greatest(coalesce(p_years, 5), 1)) + 10))::date as start_date,
      (252 * greatest(coalesce(p_years, 5), 1) * 0.90)::int as min_rows
  ),
  active as (
    select symbol
    from stock_universe
    where is_active = true
      and market = 'NSE'
      and series = 'EQ'
  ),
  latest as (
    select max(d.trade_date) as latest_date
    from daily_ohlcv d
    join active a on a.symbol = d.symbol
  ),
  counts as (
    select a.symbol, count(d.trade_date)::int as row_count
    from active a
    left join daily_ohlcv d
      on d.symbol = a.symbol
     and d.trade_date >= (select start_date from params)
    group by a.symbol
  )
  select
    (select count(*) from active)::int as active_nse_eq_symbols,
    (select start_date from params) as window_start,
    (select latest_date from latest) as latest_covered_trade_date,
    (
      select count(distinct d.symbol)::int
      from daily_ohlcv d
      join active a on a.symbol = d.symbol
      where d.trade_date = (select latest_date from latest)
    ) as symbols_on_latest_date,
    count(*) filter (where c.row_count >= (select min_rows from params))::int as chart_ready_symbols,
    count(*) filter (where c.row_count > 0 and c.row_count < (select min_rows from params))::int as partial_history_symbols,
    count(*) filter (where c.row_count = 0)::int as missing_history_symbols
  from counts c;
$$;

grant execute on function public.market_data_coverage_audit(int)
  to anon, authenticated, service_role;

reset statement_timeout;
