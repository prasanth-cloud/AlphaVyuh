# Chart Plan Context Handoff - 2026-05-19

## Objective

Make the full-chart risk/reward drawing workflow behave more like a serious
analysis desk by carrying chart context into the Watchlist Decision Desk, not
just raw entry/stop/target numbers.

## Agent Report

| Agent | Change | Product impact | Learning | Remaining risk |
|---|---|---|---|---|
| Chart Agent | Added a typed chart-plan draft builder for position drawings. | A full-chart long/short position drawing now captures symbol, side, levels, R:R, timeframe, setup label, playbook score, and ready checks. | The chart already had strong visual tools; the missing piece was context continuity after handoff. | Snapshot images/state still require a future backend-backed storage path. |
| Watchlist Agent | Converted chart drafts into richer Decision Desk workflow patches. | The watchlist receives thesis, invalidation, quality, tags, notes, and levels from the chart, so journal drafts can preserve the original analysis. | Raw levels alone are not enough for review quality. | Live persistence still depends on the recovered backend. |
| QA Agent | Added unit coverage for draft validation/parsing and mock browser coverage for drawing-to-watchlist handoff. | The chart-to-watchlist path is protected against broken geometry, symbol mismatch, and context loss. | E2E coverage should exercise trader flows, not just isolated routes. | Production browser proof still requires Railway and production auth recovery. |

## Validation Plan

- PASS `npm --prefix frontend run test -- tests/unit/chart-plan-handoff.test.ts`
- PASS `npm --prefix frontend exec -- playwright test --config=frontend/playwright.mock.config.ts frontend/tests/e2e/workflow-mock.spec.ts --grep "position drawing sends chart context"`
- PASS `npm run typecheck`
- PASS `npm run test:e2e:layout`
- PASS `npm run test:e2e:smoke`
- EXPECTED FAIL `npm run check:data-recovery`: production API at `https://alphavyuh-production.up.railway.app` still aborts, Railway GitHub secrets are missing, and local Railway CLI auth needs refresh. Supabase EOD data remains present through `2026-05-19` with `3101/3448` symbols.

## Next Step

After backend recovery, persist chart-plan context server-side with journal rows
and add a real chart snapshot/storage path for trade review.
