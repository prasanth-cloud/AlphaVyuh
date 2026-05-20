# 2026-05-20 - Chart candle outage status

Goal: make backend chart candle outages explicit non-2xx responses rather than successful empty payloads.

Changes:
- Changed chart candle metadata failures to raise HTTP 503 with `Candle metadata is temporarily unavailable.`
- Changed chart candle query failures to raise HTTP 503 with `Candle query is temporarily unavailable.`
- Added backend tests for both outage branches so chart candle failures cannot regress to HTTP 200 `mode: "unavailable"` payloads.

Validation:
- `pytest backend/tests/test_charts.py backend/tests/test_public_market_rate_limits.py` passed: 14 tests.
- `npm test -- tests/unit/candles-cache.test.ts` from `frontend` passed: 1 file, 7 tests.
- `npm run typecheck` from `frontend` passed.

Production recovery:
- This tightens the chart API contract but does not complete production recovery. `npm run check:data-recovery` still has to pass against the Railway production backend before recovery is complete.
