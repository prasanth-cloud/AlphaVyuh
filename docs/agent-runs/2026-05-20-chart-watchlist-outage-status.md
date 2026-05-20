# Chart Watchlist Outage Status

Date: 2026-05-20
Branch: `codex/chart-watchlist-outage-status`

## Scope

The chart page depended on watchlist requests for two trader workflows: showing the originating watchlist queue and adding the active symbol to another watchlist. When those requests failed, the chart silently dropped queue context or surfaced only a transient toast, leaving traders without a durable explanation or retry path.

## Changes

- Added explicit chart page state for watchlist loading and failure paths.
- Shows a chart-level `Watchlist queue unavailable` banner when a chart was opened from a watchlist but the source queue cannot be loaded.
- Keeps chart review, drawing tools, alerts, positions, and order planning visible while the watchlist queue is unavailable.
- Reworked add-to-watchlist failures into an inline `Watchlists unavailable` selector state with retry and close controls.
- Preserves successful watchlist picker behavior and empty-watchlist messaging.
- Added a focused Playwright spec that forces the watchlist API to return 503 while chart candles and indicators continue to load.

## Verification

- `PLAYWRIGHT_MOCK_AUTH=true NEXT_PUBLIC_DATA_MODE=mock NEXT_PUBLIC_FORCE_LIVE_DATA=true NEXT_PUBLIC_ALLOW_MOCK_FALLBACK=false npm exec -- playwright test --config=playwright.config.ts tests/e2e/chart-watchlists-unavailable.spec.ts`
- `npm run typecheck`
- `npm run test:production-api-check`
- `npm run test:production-smoke-env-check`
- `python -m pip_audit -r backend/requirements.txt --disable-pip --no-deps --progress-spinner off`
- `npm run e2e:mock`
- `git diff --check`
- In-app Browser check could not run because the Browser backend did not advertise an `iab` target in this desktop session; the focused Playwright spec covers the rendered chart outage and retry workflow.

## Recovery Note

This change hardens the chart/watchlist workflow but does not complete production data recovery. Railway backend hosting credentials/auth still need to be restored before the production API can be verified end to end.
