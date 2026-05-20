# 2026-05-20 - Unavailable payloads are not empty results

## Summary

- Updated the watchlist client to reject successful HTTP responses that carry `mode: "unavailable"` or `status: "unavailable"` instead of returning an empty list.
- Updated the scanner API helper to reject successful unavailable payloads instead of returning zero matches.
- Updated the scanner page direct run path so backend scanner outages do not mark a scan as completed with zero results.
- Added route-intercept coverage proving the scanner shows unavailable copy and does not show `No stocks matched` for an unavailable payload.

## Verification

- `npm run typecheck` from `frontend` passed.
- `npm test -- tests/unit/scanner-api.test.ts tests/unit/watchlists-api.test.ts tests/unit/data-errors.test.ts` from `frontend` passed: 3 files, 5 tests.
- `NEXT_PUBLIC_API_URL=http://localhost:8000 NEXT_PUBLIC_DATA_MODE=mock NEXT_PUBLIC_ALLOW_MOCK_FALLBACK=true NEXT_PUBLIC_FORCE_LIVE_DATA=true PLAYWRIGHT_MOCK_AUTH=true PLAYWRIGHT_BASE_URL=http://localhost:3000 npm exec -- playwright test --config=playwright.config.ts tests/e2e/scanner-unavailable.spec.ts` from `frontend` passed: 1 test.
- `npm run e2e:mock` from `frontend` passed: 12 tests.
- `npm run check:data-recovery` from repo root still fails as expected because Railway production API returns 404 `Application not found`, GitHub Railway recovery secrets are missing, no Railway recovery workflow runs exist, and local Railway CLI auth needs `railway login`.

## Remaining risk

Backend chart candle routes can still emit HTTP 200 unavailable payloads. The chart UI already has stronger error copy for failed candle loads, but the backend status code should be revisited after this scanner/watchlist guard.
