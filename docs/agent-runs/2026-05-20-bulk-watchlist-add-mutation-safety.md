# Bulk Watchlist Add Mutation Safety

## Goal

Prevent bulk watchlist add flows from looking successful when the backend rejects
symbol mutations.

## Changes

| Area | Change | Trader impact | Remaining dependency |
| --- | --- | --- | --- |
| Watchlist starter queue | Starter symbols are added to local UI only after each backend add succeeds; failed adds surface backend detail in the inline status and toast. | A fresh watchlist no longer fills with symbols that were not persisted. | Live persistence proof still waits on Railway backend recovery. |
| Scanner create watchlist | Scanner-created watchlists now add symbols one by one, persist workflow context only for confirmed additions, and keep the trader on scanner with an error toast when any add fails. | Scanner bulk-create no longer routes traders into a supposedly populated queue when symbol adds failed. | Live scanner/watchlist proof still waits on Railway backend recovery. |
| Regression coverage | Added unit coverage for `addToWatchlist` failures and forced-live Playwright coverage for starter queue and scanner-created watchlist failures. | Future edits should not reintroduce false-success bulk watchlist adds. | In-app Browser is unavailable in this desktop session, so Playwright is the browser fallback evidence. |

## Validation

- PASS `npm --prefix frontend run test -- --run tests/unit/watchlists-api.test.ts`
- PASS `PLAYWRIGHT_MOCK_AUTH=true NEXT_PUBLIC_DATA_MODE=mock NEXT_PUBLIC_FORCE_LIVE_DATA=true NEXT_PUBLIC_ALLOW_MOCK_FALLBACK=false npm --prefix frontend exec -- playwright test --config=frontend/playwright.config.ts frontend/tests/e2e/watchlist-mutation-failures.spec.ts frontend/tests/e2e/scanner-unavailable.spec.ts --grep "starter symbols|scanner-created"`
- PASS `PLAYWRIGHT_MOCK_AUTH=true NEXT_PUBLIC_DATA_MODE=mock NEXT_PUBLIC_FORCE_LIVE_DATA=true NEXT_PUBLIC_ALLOW_MOCK_FALLBACK=false npm --prefix frontend exec -- playwright test --config=frontend/playwright.config.ts frontend/tests/e2e/watchlist-mutation-failures.spec.ts frontend/tests/e2e/scanner-unavailable.spec.ts`
- PASS `npm --prefix frontend run lint`
- PASS `npm --prefix frontend run typecheck`
- PASS `git diff --check`
- PASS `npm --prefix frontend run test`
- PASS `npm run test:production-api-check`
- PASS `npm run test:production-smoke-env-check`
- PASS `npm --prefix frontend run e2e:mock`
- INFO Browser skill was read and the in-app browser was attempted, but `agent.browsers.list()` returned `[]`; the forced-live Playwright specs above are the browser fallback evidence.

## Follow-up

After Railway backend recovery, repeat scanner bulk-create and watchlist starter
queue checks against production with authenticated watchlist persistence.
