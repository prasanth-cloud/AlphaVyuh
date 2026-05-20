# Scanner Handoff Auto-Add Failure - 2026-05-20

## Goal

Continue watchlist reliability hardening by making scanner-to-watchlist handoff failures visible. When a routed symbol is not already in any watchlist and the backend cannot add it to the active list, the user should not see a false successful add or a silent no-op.

## Changes

- Watchlist route handoff now shows a toast when auto-adding the routed symbol fails.
- The routed symbol remains focused in the chart header, so the trader can still inspect it.
- The failed symbol is not inserted into the watchlist table optimistically.
- A per-route attempt guard prevents duplicate auto-add attempts in dev/Strict Mode.
- Expanded the forced-live watchlist mutation failure spec to cover scanner handoff auto-add failures.

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

This slice improves watchlist workflow reliability. Production data recovery remains blocked until the Railway backend is restored and Railway recovery credentials are available. The latest `npm run check:data-recovery` still reports Railway fallback 404 on `/health` with request id `smSmtQKQS26eYoFqH4GxDA`, missing `RAILWAY_TOKEN`, `RAILWAY_PROJECT_ID`, and `RAILWAY_SERVICE`, no Railway Backend Recovery workflow runs, and local Railway CLI `invalid_grant`.
