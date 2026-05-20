# Chart Watchlist Source Context - 2026-05-20

## Objective

Keep the originating watchlist attached when a full-chart position drawing is
sent back into the Watchlist Decision Desk.

## Agent Report

| Agent | Change | Product impact | Learning | Remaining risk |
|---|---|---|---|---|
| Explorer Agent | Identified that chart handoff dropped `watchlistId` on return to `/watchlist`. | The next implementation slice was focused on a concrete chart/watchlist workflow failure. | Same-symbol workflows need queue identity, not only symbol identity. | Broader multi-watchlist workflows still need live backend proof after recovery. |
| Chart Agent | Added a watchlist return URL builder that preserves `id` for Exit full and Send plan. | A trader opening a full chart from a specific queue returns to that same queue. | Return navigation should carry the same route context as chart navigation. | Chart snapshots still need durable server-side storage later. |
| Watchlist Agent | Waits for the routed watchlist before applying chart plan drafts and scopes duplicate apply keys by watchlist. | Chart plans no longer get applied to the wrong queue when a symbol appears in multiple watchlists. | Draft consumption must wait for route context before removing local storage. | Live persistence still depends on the recovered backend. |
| QA Agent | Extended browser coverage with two seeded watchlists containing `AUBANK`. | Regression coverage now proves the workflow stores `watchlist_id` from the source queue. | The first test run exposed a real load-order race, which is now fixed. | Production browser proof still requires Railway and production auth recovery. |

## Validation Plan

- PASS `npm run typecheck`
- PASS `npm exec -- playwright test --config=playwright.mock.config.ts tests/e2e/workflow-mock.spec.ts --grep "position drawing sends chart context"`
- EXPECTED FAIL `npm run check:data-recovery`: production API at `https://alphavyuh-production.up.railway.app` still aborts, Railway GitHub secrets are missing, and local Railway CLI auth needs refresh. Supabase EOD data remains present through `2026-05-19` with `3101/3448` symbols.

## Next Step

After Railway recovery, run the same chart-to-watchlist flow against production
auth and persist chart-originated plan context through the backend.
