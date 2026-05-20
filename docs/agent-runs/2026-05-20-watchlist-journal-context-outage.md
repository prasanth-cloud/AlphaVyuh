# Watchlist Journal Context Outage - 2026-05-20

## Goal

Continue watchlist reliability hardening by making Journal review-context outages visible. If Journal entries cannot load, the watchlist should not imply a symbol has no review history.

## Changes

- Watchlist now tracks Journal entry load failures separately from an empty Journal result.
- Selected-symbol summary shows a visible warning when Journal review context is unavailable.
- The expanded details panel pauses review badges/context and explains that Journal recovery is needed.
- Queue, chart review, and planning remain usable while Journal context is unavailable.
- Expanded forced-live watchlist mutation failure coverage for Journal entry outage behavior.

## Validation

- `PLAYWRIGHT_MOCK_AUTH=true NEXT_PUBLIC_DATA_MODE=mock NEXT_PUBLIC_FORCE_LIVE_DATA=true NEXT_PUBLIC_ALLOW_MOCK_FALLBACK=false npm --prefix frontend exec -- playwright test --config=frontend/playwright.config.ts frontend/tests/e2e/watchlist-mutation-failures.spec.ts`
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

This slice improves watchlist review-context reliability. Production data recovery remains blocked until the Railway backend is restored and Railway recovery credentials are available. The latest `npm run check:data-recovery` still reports Railway fallback 404 on `/health` with request id `6itKxx3CT8OzEgR3FFmdQQ`, missing `RAILWAY_TOKEN`, `RAILWAY_PROJECT_ID`, and `RAILWAY_SERVICE`, no Railway Backend Recovery workflow runs, and local Railway CLI `invalid_grant`.
