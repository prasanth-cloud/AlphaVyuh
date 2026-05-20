# 2026-05-20 - Chart unavailable payloads

Goal: prevent chart outage payloads from rendering as valid empty charts.

Changes:
- Updated the chart candle client to reject HTTP 200 responses carrying `mode: "unavailable"` or `status: "unavailable"` instead of caching them as empty candle data.
- Applied the same unavailable-payload guard to live candle and chart indicator responses so provider/proxy outages cannot flatten into blank indicators or blank live charts.
- Added a full-chart e2e regression that intercepts a successful unavailable candle payload and verifies outage copy is shown.
- Added unit coverage for EOD candles, live candles, indicators, and the retry path after an unavailable candle response.

Validation:
- `npm test -- tests/unit/candles-cache.test.ts tests/unit/data-errors.test.ts` from `frontend` passed: 2 files, 9 tests.
- `npm run typecheck` from `frontend` passed.
- `NEXT_PUBLIC_API_URL=http://localhost:8000 NEXT_PUBLIC_DATA_MODE=mock NEXT_PUBLIC_ALLOW_MOCK_FALLBACK=true NEXT_PUBLIC_FORCE_LIVE_DATA=true PLAYWRIGHT_MOCK_AUTH=true PLAYWRIGHT_BASE_URL=http://localhost:3000 npm exec -- playwright test --config=playwright.config.ts tests/e2e/chart-unavailable.spec.ts` from `frontend` passed: 1 test.
- `npm run e2e:mock` from `frontend` passed: 12 tests.

Production recovery:
- This does not complete production data recovery. Railway/backend recovery still requires the production API to stop returning the Railway fallback response and pass `npm run check:data-recovery`.
