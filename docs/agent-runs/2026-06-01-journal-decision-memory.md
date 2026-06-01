# Journal Decision Memory

## Scope
- Added a decision-memory summary to the Journal review queue so closed trades show review coverage and whether original scanner, chart, watchlist, or broker context was preserved.
- Kept the copy process-focused and cash-equity only; no execution, recommendation, F&O, options, or derivatives language was added.

## Branch / Worktree
- Branch: `codex/journal-decision-memory`
- Worktree: `/private/tmp/alphavyuh-journal-decision-memory`

## Files Changed
- `frontend/app/(app)/journal/components/utils.ts`
- `frontend/app/(app)/journal/page.tsx`
- `frontend/tests/unit/journal-review-context.test.ts`
- `docs/agent-runs/2026-06-01-journal-decision-memory.md`

## Tests Run
- `npm --prefix frontend run test -- tests/unit/journal-review-context.test.ts`
- `npm exec eslint 'app/(app)/journal/page.tsx' 'app/(app)/journal/components/utils.ts' tests/unit/journal-review-context.test.ts`
- `npm --prefix frontend run typecheck`
- `npm run e2e:layout`
- `git diff --check`

## Open Decisions
- Decide whether the review coverage target should stay at 100% for the first launch gate or become a softer threshold after real users have larger journals.
- Decide whether broker import rows should count as decision context only when the imported row also carries a source context string.

## Known Risks
- The Journal page still depends on currently loaded entries for context counts; if stats cover more closed trades than the current entry page, the review percentage can come from stats while the context count comes from loaded rows.
- This slice improves the visible review loop but does not yet add deeper setup-level cohort analytics.

## Next Steps
- Open a PR and wait for hosted checks.
- Continue with the next isolated slice: broker read-only evidence and/or sector/source approval visibility.
