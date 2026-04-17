-- Phase 4: International markets + NRI/USD pricing

-- 1. Extend stock_universe with market + currency
alter table public.stock_universe
  add column if not exists market   text not null default 'NSE'
    check (market in ('NSE','BSE','NASDAQ','NYSE')),
  add column if not exists currency text not null default 'INR'
    check (currency in ('INR','USD'));

create index if not exists idx_stock_universe_market on public.stock_universe(market);

-- 2. User billing preferences (region + currency)
alter table public.users
  add column if not exists billing_region   text not null default 'IN'
    check (billing_region in ('IN','NRI','US','INTL')),
  add column if not exists billing_currency text not null default 'INR'
    check (billing_currency in ('INR','USD'));

-- 3. Payment log currency (for USD payment reconciliation)
-- payment_logs is created at runtime by the Razorpay flow; guard with IF EXISTS.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'payment_logs') then
    execute $sql$alter table public.payment_logs add column if not exists currency text not null default 'INR' check (currency in ('INR','USD'))$sql$;
  end if;
end $$;

-- 4. Seed a curated list of popular US stocks so the universe is non-empty
insert into public.stock_universe (symbol, company_name, series, sector, market, currency, is_active) values
  ('AAPL',  'Apple Inc.',              'EQ', 'Technology',        'NASDAQ','USD', true),
  ('MSFT',  'Microsoft Corporation',   'EQ', 'Technology',        'NASDAQ','USD', true),
  ('GOOGL', 'Alphabet Inc. Class A',   'EQ', 'Technology',        'NASDAQ','USD', true),
  ('AMZN',  'Amazon.com Inc.',         'EQ', 'Consumer Cyclical', 'NASDAQ','USD', true),
  ('META',  'Meta Platforms Inc.',     'EQ', 'Technology',        'NASDAQ','USD', true),
  ('NVDA',  'NVIDIA Corporation',      'EQ', 'Technology',        'NASDAQ','USD', true),
  ('TSLA',  'Tesla Inc.',              'EQ', 'Consumer Cyclical', 'NASDAQ','USD', true),
  ('NFLX',  'Netflix Inc.',            'EQ', 'Communication',     'NASDAQ','USD', true),
  ('AMD',   'Advanced Micro Devices',  'EQ', 'Technology',        'NASDAQ','USD', true),
  ('INTC',  'Intel Corporation',       'EQ', 'Technology',        'NASDAQ','USD', true),
  ('JPM',   'JPMorgan Chase & Co.',    'EQ', 'Financial Services','NYSE',  'USD', true),
  ('BAC',   'Bank of America Corp.',   'EQ', 'Financial Services','NYSE',  'USD', true),
  ('V',     'Visa Inc.',               'EQ', 'Financial Services','NYSE',  'USD', true),
  ('MA',    'Mastercard Incorporated', 'EQ', 'Financial Services','NYSE',  'USD', true),
  ('WMT',   'Walmart Inc.',            'EQ', 'Consumer Defensive','NYSE',  'USD', true),
  ('KO',    'The Coca-Cola Company',   'EQ', 'Consumer Defensive','NYSE',  'USD', true),
  ('PEP',   'PepsiCo Inc.',            'EQ', 'Consumer Defensive','NASDAQ','USD', true),
  ('DIS',   'The Walt Disney Company', 'EQ', 'Communication',     'NYSE',  'USD', true),
  ('NKE',   'NIKE Inc.',               'EQ', 'Consumer Cyclical', 'NYSE',  'USD', true),
  ('XOM',   'Exxon Mobil Corporation', 'EQ', 'Energy',            'NYSE',  'USD', true),
  ('CVX',   'Chevron Corporation',     'EQ', 'Energy',            'NYSE',  'USD', true),
  ('PFE',   'Pfizer Inc.',             'EQ', 'Healthcare',        'NYSE',  'USD', true),
  ('JNJ',   'Johnson & Johnson',       'EQ', 'Healthcare',        'NYSE',  'USD', true),
  ('UNH',   'UnitedHealth Group Inc.', 'EQ', 'Healthcare',        'NYSE',  'USD', true),
  ('MRK',   'Merck & Co. Inc.',        'EQ', 'Healthcare',        'NYSE',  'USD', true),
  ('ABNB',  'Airbnb Inc.',             'EQ', 'Consumer Cyclical', 'NASDAQ','USD', true),
  ('UBER',  'Uber Technologies Inc.',  'EQ', 'Industrials',       'NYSE',  'USD', true),
  ('SHOP',  'Shopify Inc.',            'EQ', 'Technology',        'NYSE',  'USD', true),
  ('PLTR',  'Palantir Technologies',   'EQ', 'Technology',        'NASDAQ','USD', true),
  ('CRM',   'Salesforce Inc.',         'EQ', 'Technology',        'NYSE',  'USD', true),
  ('ORCL',  'Oracle Corporation',      'EQ', 'Technology',        'NYSE',  'USD', true),
  ('ADBE',  'Adobe Inc.',              'EQ', 'Technology',        'NASDAQ','USD', true),
  ('CSCO',  'Cisco Systems Inc.',      'EQ', 'Technology',        'NASDAQ','USD', true),
  ('QCOM',  'Qualcomm Incorporated',   'EQ', 'Technology',        'NASDAQ','USD', true),
  ('TXN',   'Texas Instruments',       'EQ', 'Technology',        'NASDAQ','USD', true),
  ('AVGO',  'Broadcom Inc.',           'EQ', 'Technology',        'NASDAQ','USD', true),
  ('COIN',  'Coinbase Global Inc.',    'EQ', 'Financial Services','NASDAQ','USD', true),
  ('SQ',    'Block Inc.',              'EQ', 'Financial Services','NYSE',  'USD', true),
  ('PYPL',  'PayPal Holdings Inc.',    'EQ', 'Financial Services','NASDAQ','USD', true),
  ('SPY',   'SPDR S&P 500 ETF Trust',  'EQ', 'ETF',               'NYSE',  'USD', true),
  ('QQQ',   'Invesco QQQ Trust',       'EQ', 'ETF',               'NASDAQ','USD', true),
  ('DIA',   'SPDR Dow Jones ETF',      'EQ', 'ETF',               'NYSE',  'USD', true),
  ('IWM',   'iShares Russell 2000',    'EQ', 'ETF',               'NYSE',  'USD', true),
  ('VOO',   'Vanguard S&P 500 ETF',    'EQ', 'ETF',               'NYSE',  'USD', true),
  ('ARKK',  'ARK Innovation ETF',      'EQ', 'ETF',               'NYSE',  'USD', true)
on conflict (symbol) do update
  set company_name = excluded.company_name,
      market       = excluded.market,
      currency     = excluded.currency,
      sector       = excluded.sector,
      updated_at   = now();
