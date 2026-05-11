# Market Breadth Snapshot Operations

AlphaVyuh stores the dashboard market breadth summary as an `ingest_runs` metadata row:

```text
market-breadth-snapshot-YYYY-MM-DD
```

This lets the dashboard load the market pulse from one compact read instead of scanning the full `daily_ohlcv` universe during first paint.

## Backfill Latest Complete Session

```bash
cd backend
python scripts/backfill_market_breadth_snapshot.py
```

## Backfill A Specific Session

```bash
cd backend
python scripts/backfill_market_breadth_snapshot.py --date 2026-05-08
```

## Verify Existing Snapshot

```bash
cd backend
python scripts/backfill_market_breadth_snapshot.py --verify-only
```

The command prints only non-sensitive metadata: trade date, row count, coverage, market phase, and generation time.

## Why This Helps Traders

- Faster dashboard first usable state.
- Stable sector breadth for the latest complete market session.
- Auditable daily summary tied to the ingest run history.
- No extra Supabase schema migration is required.

## DB Access Note

If direct Supabase CLI migration commands fail, check that database URLs in `.env.local` have URL-encoded passwords. Characters such as `@`, `&`, `/`, and `#` must be percent-encoded inside the password portion of a Postgres URL.
