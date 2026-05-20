# Watchlist Workspace Sync Warning - 2026-05-20

## Goal

Continue production-data recovery hardening by making watchlist mini-chart workspace saves explicit when the backend write fails. Indicator and drawing changes should remain available from local cache, but users should see that the change did not sync.

## Changes

- `saveChartWorkspace` now accepts `throwOnFailure` so UI paths can opt into surfacing remote write failures while preserving the local cached workspace.
- `useChartWorkspace` records a `saveError` when the deferred workspace save fails after a local cache write.
- The watchlist chart header renders a warning when workspace load or save status needs attention.
- Added unit coverage for opt-in workspace save rejection plus local cache retention.
- Added forced-live Playwright coverage for a failed indicator-save sync in the watchlist Decision Desk.

## Validation

- `npm --prefix frontend run test -- --run tests/unit/mock-chart-persistence.test.ts`
- `PLAYWRIGHT_MOCK_AUTH=true NEXT_PUBLIC_DATA_MODE=mock NEXT_PUBLIC_FORCE_LIVE_DATA=true NEXT_PUBLIC_ALLOW_MOCK_FALLBACK=false npm --prefix frontend exec -- playwright test --config=frontend/playwright.config.ts frontend/tests/e2e/watchlist-workspace-failures.spec.ts`
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

This slice improves degraded-write visibility in the app, but it does not clear the production recovery blocker. Railway backend health and Railway credentials still need to be restored and verified before the recovery goal can be marked complete.
