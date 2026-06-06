# Scanner Run History Slice

Issue: #282
Branch: `codex/issue-282-run-history`

## Scope

- Added a bounded local scanner run history for recent setup reviews.
- Persisted run label, source/as-of metadata, coverage, filters, sort, page state, top symbols, and the displayed result page.
- Added a sidebar "Recent runs" restore path that reloads cached scanner results with the existing data provenance badge.

## Verification

- Unit coverage: `frontend/tests/unit/scanner-run-history.test.ts`
- Mock workflow coverage: `frontend/tests/e2e/workflow-mock.spec.ts` scanner recent-run restore smoke

## Notes

- This is local-first and does not create a backend schema yet.
- The history is capped to eight runs and 200 rows per run to avoid localStorage bloat.
- It complements the scanner -> watchlist -> chart review flow while the larger alert/run-history backend contract remains open.
