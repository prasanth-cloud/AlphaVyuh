# 2026-05-20 - Market summary outage status

Goal: prevent market summary database outages from looking like a healthy zero-breadth market snapshot.

Changes:
- Changed the backend `/api/v1/market/summary` DB failure path to return HTTP 503 with `Market summary is temporarily unavailable.`
- Updated the frontend market summary client to reject HTTP 200 payloads carrying `mode: "unavailable"` or `status: "unavailable"` instead of treating them as usable breadth data.
- Added backend and frontend unit coverage for unavailable market summary paths.

Validation:
- `pytest backend/tests/test_market_summary.py backend/tests/test_market_overview_failsoft.py backend/tests/test_stock_quotes.py` passed: 5 tests.
- `npm test -- tests/unit/market-summary-api.test.ts tests/unit/market-overview-api.test.ts tests/unit/quotes-api.test.ts` passed: 3 files, 5 tests.
- `npm run typecheck` passed.
- `npm run test:production-api-check` passed.
- `npm run test:production-smoke-env-check` passed.
- `npm run test:e2e:mock` passed: 12 tests.

Production recovery:
- This hardens market summary trust states but does not complete production recovery. Railway/backend recovery still requires `npm run check:data-recovery` to pass against production.
