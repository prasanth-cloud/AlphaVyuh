# Data Trust Bug Fix Pass

## Surface
- Market session selection for dashboard/scanner/watchlist/chart consumers.
- Dashboard market breadth snapshot reads/writes.
- Vercel read-only recovery chart mutation routes.
- Production API smoke gates.

## Trust Risk
- A raw newest `daily_ohlcv.trade_date` can look complete by row count while most rows are unchanged or copied from the prior session.
- A bad `market-breadth-snapshot-*` row can make `/api/v1/market/summary` look successful while reporting false breadth.
- Read-only recovery chart mutation routes were returning successful-looking `local_only` payloads for changes that were not persisted.

## Change
- `get_latest_complete_trade_date` now rejects complete-looking sessions when breadth is implausibly flat or newest OHLCV/volume rows duplicate the prior session.
- Market breadth snapshot build/read paths reject implausibly flat breadth snapshots, so bad snapshots cannot be selected as the official overview.
- Chart drawings, layout, and workspace recovery `POST` routes now return `503` with `{ status: "unavailable", mode: "unavailable" }`.
- `check-production-api` now fails on flat breadth, duplicated latest candles, and all-zero latest smoke-symbol pct changes.

## Verification
- `PYTHONPATH=backend backend/.venv39/bin/python -m pytest backend/tests/test_market_dates.py backend/tests/test_market_breadth_snapshot.py`
- `npm exec -- vitest run tests/unit/recovery-chart-routes.test.ts`
- `npm run test:production-api-check`
- `npm run test`
- `npm run lint`
- `npm run typecheck`
- `git diff --check`

## Owner-Gated Production Repair Notes
Do not run these without explicit owner approval and verified production credentials:

1. Capture evidence only:
   - `PRODUCTION_API_URL=https://<production-api-host> npm run check:production-api`
   - `cd backend && python scripts/backfill_market_breadth_snapshot.py --verify-only`
2. Repair the corrupted session window only after approval:
   - `cd backend && python scripts/backfill_bhavcopy.py --start-date 2026-05-28 --end-date 2026-05-28`
3. Rebuild the latest trustworthy breadth snapshot:
   - `cd backend && python scripts/backfill_market_breadth_snapshot.py`
4. Re-run evidence:
   - `PRODUCTION_API_URL=https://<production-api-host> npm run check:production-api`

## Remaining Risk
- The PR prevents future bad date/snapshot selection and makes existing bad snapshots invisible to read paths. It does not mutate production Supabase by itself.
