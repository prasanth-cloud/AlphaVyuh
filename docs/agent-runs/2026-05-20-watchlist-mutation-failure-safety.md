# Watchlist Mutation Failure Safety

## Objective

Prevent failed watchlist edit requests from looking successful in the trader's
queue. Deleting a list, removing a symbol, or saving a reorder should now fail
visibly when the backend rejects the mutation.

## Changes

| Area | What changed | Why it matters | Residual risk |
| --- | --- | --- | --- |
| Watchlist API client | `deleteWatchlist`, `removeFromWatchlist`, and `reorderWatchlist` now reject failed HTTP responses with backend detail; add-to-watchlist also preserves backend detail. | The frontend no longer treats rejected mutations as successful local edits. | Backend recovery is still required for live persistence proof in production. |
| Watchlist queue UI | Failed symbol removal keeps the row visible and shows a toast; failed drag reorder rolls the queue back and shows a toast. | Traders do not lose trust by seeing a queue change that was not actually saved. | Multi-user conflict resolution still needs server-side versioning later. |
| Regression coverage | Added unit coverage for failed delete/remove/reorder mutations and a forced-live Playwright check for failed symbol removal. | Future edits should not reintroduce false-success watchlist mutations. | In-app Browser is unavailable in this desktop session, so Playwright is the browser fallback evidence. |

## Validation

- PASS `npm --prefix frontend run test -- --run tests/unit/watchlists-api.test.ts tests/unit/mock-watchlists.test.ts`
- PASS `PLAYWRIGHT_MOCK_AUTH=true NEXT_PUBLIC_DATA_MODE=mock NEXT_PUBLIC_FORCE_LIVE_DATA=true NEXT_PUBLIC_ALLOW_MOCK_FALLBACK=false npm --prefix frontend exec -- playwright test --config=frontend/playwright.config.ts frontend/tests/e2e/watchlist-mutation-failures.spec.ts`
- PASS `npm --prefix frontend run lint` with one pre-existing warning in `frontend/app/(app)/scanner/page.tsx`
- PASS `npm --prefix frontend run typecheck`
- PASS `npm run test:production-api-check`
- PASS `npm run test:production-smoke-env-check`
- PASS `git diff --check`
- PASS `npm --prefix frontend run test`
- PASS `npm --prefix frontend run e2e:mock`
- INFO In-app Browser verification was attempted after reading the Browser skill, but `agent.browsers.list()` returned `[]`; Playwright forced-live coverage is the browser fallback evidence.

## Follow-up

After Railway backend recovery, repeat delete/remove/reorder watchlist checks
against production auth to prove live persistence and rollback behavior on real
API responses.
