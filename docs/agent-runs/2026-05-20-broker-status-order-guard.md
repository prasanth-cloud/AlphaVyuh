# Broker Status Order Guard - 2026-05-20

## Goal

Continue reliability hardening for core trading workflows by preventing broker status outages from looking like a normal disconnected/simulated state in order entry surfaces.

## Changes

- Watchlist quick order now surfaces broker status failures in the order ticket and safety nudges.
- Full-chart order modal now shows a broker status warning instead of silently swallowing the status request failure.
- Both order entry paths keep the conservative fallback: when broker status cannot be verified, live broker routing is disabled and the UI stays on journal-draft capture.
- Added forced-live Playwright coverage for watchlist quick order behavior when `/api/v1/broker/status` returns `503`.

## Validation

- `PLAYWRIGHT_MOCK_AUTH=true NEXT_PUBLIC_DATA_MODE=mock NEXT_PUBLIC_FORCE_LIVE_DATA=true NEXT_PUBLIC_ALLOW_MOCK_FALLBACK=false npm --prefix frontend exec -- playwright test --config=frontend/playwright.config.ts frontend/tests/e2e/watchlist-broker-status-failures.spec.ts`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run typecheck`
- `git diff --check`
- `npm --prefix frontend run test`
- `npm run test:production-api-check`
- `npm run test:production-smoke-env-check`
- `npm --prefix frontend run e2e:mock`

## Browser Evidence

In-app Browser verification was attempted after the frontend change, but the Browser runtime reported no available browser instances (`[]`). Playwright browser coverage above is the fallback evidence for the UI flow.

## Recovery Status

This slice improves broker/order degradation behavior. Production data recovery remains blocked until the Railway backend is restored and Railway recovery credentials are available. The latest `npm run check:data-recovery` still reports Railway fallback 404 on `/health` with request id `vHtcv4nmS2eVmjdkwoOzXw`, missing `RAILWAY_TOKEN`, `RAILWAY_PROJECT_ID`, and `RAILWAY_SERVICE`, no Railway Backend Recovery workflow runs, and local Railway CLI `invalid_grant`.
