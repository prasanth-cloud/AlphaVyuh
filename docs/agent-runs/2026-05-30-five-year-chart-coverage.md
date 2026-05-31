# 2026-05-30 — Five-Year Chart Coverage Contract

## Scope

Issue #286: enforce daily OHLCV 5Y coverage for established chart smoke symbols without hiding legitimate partial-history cases.

## Changes

- Chart candle defaults now request a 5Y daily window by default and include `coverage.five_year_contract` metadata.
- Production API smoke now requests daily candles from the latest market-summary date minus five years, with a 1300-candle request and minimum 1134-bar / 1811-calendar-day checks.
- The market-data coverage audit script now reports sentinel row counts and can fail under the 5Y sentinel contract with `--fail-under-contract`.
- Chart range controls now expose `1Y`, `3Y`, `5Y`, and `Max`; `5Y` uses daily candles while `Max` keeps the monthly compressed view.

## Evidence

- PASS `cd backend && python -m pytest tests/test_charts.py -q`
- PASS `cd backend && SUPABASE_URL=https://example.supabase.co SUPABASE_SERVICE_ROLE_KEY=test-service-role-key python -m pytest -q`
- PASS `npm --prefix frontend run test -- --run tests/unit/watchlist-chart-range.test.ts`
- PASS `npm --prefix frontend run typecheck`
- PASS `npm run lint`
- PASS `npm run test`
- PASS `npm run test:production-api-check`
- PASS `npm run test:production-smoke-env-check`
- PASS `PRODUCTION_API_URL=https://alphavyuh-production.up.railway.app npm run check:production-api:railway`
  - Production summary `2026-05-29`
  - RELIANCE `1290` daily candles `2021-05-31->2026-05-29`
  - ITC `1290` daily candles `2021-05-31->2026-05-29`
  - AUBANK `1292` daily candles `2021-05-31->2026-05-29`
- PASS `python -m py_compile backend/scripts/audit_market_data_coverage.py backend/scripts/backfill_bhavcopy.py`
- PASS `git diff --check`

## Notes

- Direct Supabase coverage audit could not run locally without `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- The production public API already satisfies the upgraded sentinel contract before this branch is deployed.
- Partial-history symbols still return coverage metadata instead of being blindly failed by the UI.
