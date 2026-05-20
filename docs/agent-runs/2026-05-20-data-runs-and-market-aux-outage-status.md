# 2026-05-20 - Data runs and market auxiliary outage status

## Scope

- Harden `/api/v1/data/runs` so ingest run-history outages return HTTP 503 instead of `200 { "runs": [], "mode": "unavailable" }`.
- Add a Data trust page refresh-run panel that distinguishes real empty history from unavailable run history.
- Harden dashboard auxiliary market data:
  - `/api/v1/market/movers` now returns HTTP 503 when the latest trading date or query path is unavailable.
  - `/api/v1/market/sector-breadth` now returns HTTP 503 when the latest trading date or query path is unavailable.
  - Frontend wrappers reject both explicit unavailable payloads and legacy empty-success payloads with no trade date.
- Keep the legacy market overview fallback ordered so market summary outages are surfaced before auxiliary movers/breadth checks.

## Evidence

- Backend focused tests:
  - `pytest backend/tests/test_data_health_runs.py backend/tests/test_market_aux_outage_status.py backend/tests/test_market_summary.py backend/tests/test_market_overview_failsoft.py`
- Frontend focused tests:
  - `npm test -- tests/unit/data-runs-api.test.ts tests/unit/market-aux-api.test.ts tests/unit/market-overview-api.test.ts tests/unit/data-errors.test.ts`
- Frontend typecheck:
  - `npm run typecheck`
- Production guard scripts:
  - `npm run test:production-api-check`
  - `npm run test:production-smoke-env-check`
- Dependency audit:
  - `python -m pip_audit -r backend/requirements.txt --disable-pip --no-deps --progress-spinner off`
- Mock workflow e2e:
  - `npm run test:e2e:mock`

## CI follow-up

- GitHub Agent regression gate initially failed in the backend dependency audit because `python-jose==3.5.0` was flagged for `PYSEC-2025-185`.
- Removed the `python-jose` dependency and replaced the narrow local Supabase HS256 JWT validation path with standard-library HMAC-SHA256 verification.
- `backend/tests/test_auth_middleware.py` now builds HS256 test tokens without a third-party JWT dependency.

## Production recovery status

- This improves trust-state handling while Railway backend production recovery remains blocked.
- `npm run check:data-recovery` still fails because:
  - Production API `/health` returns Railway fallback `404 Application not found`.
  - GitHub recovery secrets are missing: `RAILWAY_TOKEN`, `RAILWAY_PROJECT_ID`, `RAILWAY_SERVICE`.
  - No Railway Backend Recovery workflow runs are available yet.
  - Local Railway CLI auth is expired and needs `npm run recover:railway-backend:login`.
- Passing recovery checks:
  - Vercel production env points at the recovery API URL with live data mode and mock fallback disabled.
  - Supabase EOD data is present for 2026-05-19 with 3101/3448 symbols, or 90% coverage.
  - Chart smoke config includes RELIANCE, ITC, and AUBANK.
