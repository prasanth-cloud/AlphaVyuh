# Database Rules

## Migration pattern
- 15 migrations: `supabase/migrations/001_users.sql` → `015_referrals_community.sql`
- **Never edit an existing migration** — always add a new numbered file
- Next file: `016_<description>.sql`
- Apply via Supabase dashboard SQL editor or `supabase db push`
- Migrations run in numeric order; gaps in numbering are allowed but confusing

## Schema overview
| Table | Key columns | Notes |
|---|---|---|
| `users` | id (FK→auth.users), plan, plan_expires_at, billing_currency, billing_region, billing_period, referral_code, onboarding_completed | plan: free/pro/elite |
| `stock_universe` | symbol (PK), company_name, series, sector, market, currency, is_active | market: NSE/BSE/NASDAQ/NYSE |
| `daily_ohlcv` | symbol+trade_date (PK), ohlcv, all indicators precomputed | FK→stock_universe via explicit FK name |
| `saved_screens` | id, user_id, name, filters (jsonb) | |
| `watchlists` | id, user_id, name, sort_order | |
| `watchlist_items` | watchlist_id+symbol (unique), sort_order | FK to both watchlists and stock_universe |
| `trade_journal` | id, user_id, symbol, status (open/closed/cancelled), pnl, lessons | lessons = AI-generated text |
| `shared_screens` | id, user_id, screen_id, upvotes, is_featured | community feature |
| `screen_upvotes` | user_id+screen_id (composite PK) | prevents double-voting |
| `referral_rewards` | referrer_id, referred_id, reward_days (unique pair) | |
| `payment_logs` | created at runtime by payments router | has `currency` column added in 014 |
| `chart_layouts` | symbol, user_id, indicators, drawing_tools | |
| `drawings` | id, user_id, symbol, tool_type, points, style, timeframe | |
| `bhavcopy_log` | trade_date, status | tracks daily ingest |

## RLS pattern
Every user-owned table must have:
```sql
alter table public.<table> enable row level security;
create policy "Users can manage own <table>" on public.<table>
  for all using (auth.uid() = user_id);
```
For public read tables (like `shared_screens`), add a separate `select using (true)` policy.

## FK disambiguation (critical)
`daily_ohlcv` has a FK to `stock_universe` named `daily_ohlcv_symbol_fkey`. PostgREST requires the explicit FK name when joining these two tables:
```python
# Correct — for any query on daily_ohlcv that joins stock_universe
"stock_universe!daily_ohlcv_symbol_fkey!inner(symbol,company_name,series,sector,is_active,market,currency)"

# Wrong — triggers PGRST201
"stock_universe!inner(symbol,company_name)"
```
Note: `watchlist_items` stores `symbol` as plain text (no FK to `stock_universe`). Watchlist enrichment joins `daily_ohlcv` to get live quotes, so the same FK hint applies there too.

If you see `PGRST201` errors, add or verify the FK hint.

## Backend DB access
- Backend always uses `get_admin_client()` (service-role key) — bypasses RLS
- Frontend uses `createClient()` (anon key) — subject to RLS
- Never use user JWT to authenticate Supabase calls from the backend

## Column naming
- Use snake_case for all columns
- Timestamps: `created_at timestamptz not null default now()`
- Update timestamps via trigger (see `012_trade_journal.sql` for pattern)
- UUIDs as PKs: `id uuid primary key default gen_random_uuid()`
- Foreign keys to users: `user_id uuid not null references public.users(id) on delete cascade`

## Never do
- Edit an existing migration file
- Add columns directly to production without a migration file
- Create a table without RLS
- Use `select *` in production queries — always specify columns
- Rely on column order — always name columns explicitly in inserts
