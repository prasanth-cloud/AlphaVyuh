# 2026-05-20 - Quote unavailable guard

Goal: prevent single-symbol quote outages from being interpreted as real zero-price quotes.

Changes:
- Changed the backend `/api/v1/stocks/{symbol}/quote` DB failure path to return HTTP 503 with `Quote data is temporarily unavailable.`
- Updated the frontend EOD quote client to reject HTTP 200 payloads carrying `mode: "unavailable"` or `status: "unavailable"` instead of caching them as quote data.
- Applied the same unavailable-payload guard to live quote responses.
- Added backend and frontend unit coverage for unavailable EOD/live quote paths.

Validation:
- `pytest backend/tests/test_stock_quotes.py backend/tests/test_public_market_rate_limits.py` passed: 4 tests.
- `npm test -- tests/unit/quotes-api.test.ts tests/unit/candles-cache.test.ts` from `frontend` passed: 2 files, 9 tests.
- `npm run typecheck` from `frontend` passed.
- `npm run e2e:mock` from `frontend` passed: 12 tests.

Production recovery:
- This hardens quote trust states but does not complete production recovery. Railway/backend recovery still requires `npm run check:data-recovery` to pass against production.
