# Journal Learning Loop

Date: 2026-05-31

## Scope

Implement the post-trade learning loop slice for AlphaVyuh's cash-equity
decision cockpit. Improve the Journal review context so scanner/watchlist
origin, outcome, holding time, planned R:R, and setup score create better
process-review prompts.

## Branch And Worktree

- Branch: `codex/journal-learning-loop`
- Worktree: `/private/tmp/alphavyuh-journal-learning-loop`

## Files Changed

- `frontend/app/(app)/journal/components/utils.ts`
- `frontend/tests/unit/journal-review-context.test.ts`
- `docs/agent-runs/2026-05-31-journal-learning-loop.md`

## Implementation Notes

- Added outcome summary for contextual journal reviews, including realised P&L
  and holding days.
- Added process-focus labels for high-score winners, high-score losers,
  favorable-R:R losers, fast exits, and long-hold discipline reviews.
- Added process prompts that connect scanner setup score and planned R:R to the
  closed-trade review.
- Preserved existing fallback behavior for trades without original idea context.
- Kept copy review-oriented and avoided recommendation, buy, or sell language.

## Tests Run

- `npm --prefix frontend run test -- tests/unit/journal-review-context.test.ts`
  - Result: passed, 5 tests.
- `npx eslint 'app/(app)/journal/components/utils.ts' tests/unit/journal-review-context.test.ts`
  - Result: passed.
- `git diff --check`
  - Result: passed.

## Open Decisions

- Whether weekly review clusters should summarize process-focus labels across
  all closed trades.
- Whether scanner setup score should become a filter in the Journal review queue.

## Known Risks

- This is a frontend review-context improvement only; backend analytics are not
  yet aggregating the new process-focus labels.
- Very old manual trades without original context intentionally remain quiet so
  the UI does not pretend it knows the setup.

## Next Steps

1. Open a PR for review.
2. After merge, add review-cluster analytics that roll these process labels up
   by setup, sector, and source.

## PR

- [#323](https://github.com/prasanth-cloud/AlphaVyuh/pull/323)
