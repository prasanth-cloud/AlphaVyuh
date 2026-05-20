# 2026-05-20 - Symbol search outage status

## Scope

- Harden `/api/v1/charts/search` so symbol-index failures return HTTP 503 instead of failing opaquely.
- Update `searchSymbols()` to reject backend service errors, legacy unavailable payloads, and malformed search responses instead of returning `[]`.
- Surface symbol-search outage copy in:
  - global app command/search
  - chart symbol search
  - watchlist add-symbol search
  - journal add-trade symbol search

## Evidence

- Backend focused tests:
  - `pytest backend/tests/test_charts.py backend/tests/test_watchlist_outage_status.py backend/tests/test_journal_context.py`
- Frontend focused tests:
  - `npm test -- tests/unit/symbol-search-api.test.ts tests/unit/watchlists-api.test.ts tests/unit/candles-cache.test.ts`
- Frontend typecheck:
  - `npm run typecheck`
- Production guard scripts:
  - `npm run test:production-api-check`
  - `npm run test:production-smoke-env-check`
- Dependency audit:
  - `python -m pip_audit -r backend/requirements.txt --disable-pip --no-deps --progress-spinner off`
- Mock workflow e2e:
  - `npm run test:e2e:mock`

## Production recovery status

- This improves trader workflow reliability while Railway backend production recovery remains blocked.
- `npm run check:data-recovery` still fails because:
  - Production API `/health` returns Railway fallback `404 Application not found`.
  - GitHub recovery secrets are missing: `RAILWAY_TOKEN`, `RAILWAY_PROJECT_ID`, `RAILWAY_SERVICE`.
  - No Railway Backend Recovery workflow runs are available yet.
  - Local Railway CLI auth is expired and needs `npm run recover:railway-backend:login`.
- Passing recovery checks:
  - Vercel production env points at the recovery API URL with live data mode and mock fallback disabled.
  - Supabase EOD data is present for 2026-05-19 with 3101/3448 symbols, or 90% coverage.
  - Chart smoke config includes RELIANCE, ITC, and AUBANK.
