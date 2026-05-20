# Trade Report Journal Import - 2026-05-19

## Objective

Turn uploaded broker/spreadsheet trade reports into actionable journal review
entries instead of leaving the import as an analytics-only preview.

## Agent Report

| Agent | Change | Product impact | Learning | Remaining risk |
|---|---|---|---|---|
| Product Agent | Added a journal handoff to `/upload` after CSV parsing. | Traders can import journal-ready rows as closed review entries and then continue directly to journal review. | Report analytics become more valuable when they enter the review loop, not just a one-off preview. | Rows without entry/exit price, dates, and quantity remain analytics-only until the backend supports direct P&L-only journal rows. |
| Data Agent | Added stable import markers and duplicate detection before saving entries. | Re-importing the same report skips duplicate trades instead of inflating journal stats. | Broker report imports need idempotency from the first usable version. | Marker-based dedupe should later be replaced or backed by a server-side import batch table. |
| QA Agent | Added unit coverage for journal import creation, close updates, duplicate skips, and ineligible rows; added mock browser coverage for upload-to-journal handoff. | The trade report workflow is now protected from parser-only regressions and journal integration regressions. | The existing mock journal API is enough to verify the end-to-end handoff while Railway remains blocked. | Live backend verification still requires Railway recovery and production QA auth. |

## Validation Plan

- PASS `npm --prefix frontend run test -- tests/unit/trade-report-import.test.ts tests/unit/trade-report-journal.test.ts`
- PASS `npm --prefix frontend exec -- playwright test --config=frontend/playwright.mock.config.ts frontend/tests/e2e/workflow-mock.spec.ts --grep "uploaded trade report"`
- PASS `npm run typecheck`
- PASS `npm run test:e2e:layout`
- PASS `npm run test:e2e:smoke`
- EXPECTED FAIL `npm run check:data-recovery`: production API at `https://alphavyuh-production.up.railway.app` still aborts, Railway GitHub secrets are missing, and local Railway CLI auth needs refresh. Supabase EOD data remains present through `2026-05-19` with `3101/3448` symbols.

## Next Step

Persist import batches server-side after Railway recovery so live users can audit
broker/source files, skipped rows, and duplicate decisions across devices.
