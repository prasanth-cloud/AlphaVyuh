# Alerts Enter Exit Digest

Date: 2026-05-31

## Scope

Implement the next P0 roadmap slice for saved scan alerts: compare consecutive
cash-equity EOD alert runs and show which symbols entered, continued matching,
or exited the saved screen.

## Branch And Worktree

- Branch: `codex/alerts-enter-exit-digest`
- Worktree: `/private/tmp/alphavyuh-alerts-enter-exit-digest`

## Files Changed

- `frontend/lib/scan-alert-digest.ts`
- `frontend/tests/unit/scan-alert-digest.test.ts`
- `frontend/app/(app)/alerts/page.tsx`
- `frontend/lib/mock-data.ts`
- `docs/agent-runs/2026-05-31-alerts-enter-exit-digest.md`

## Implementation Notes

- Added `buildScanAlertDigests` to group alert matches by alert id and compare
  each run to the prior tracked run.
- Alerts digest now shows:
  - entered names
  - still matching names
  - exited names
  - a compact lifecycle summary
- Mock scan alerts include a previous EOD run so the local UI demonstrates real
  entered/still/exited behavior.
- Kept scope cash-equity review only. No broker execution, Supabase migration,
  production mutation, deployment, or derivatives functionality.

## Tests Run

- `npm --prefix frontend run test -- tests/unit/scan-alert-digest.test.ts tests/unit/mock-scan-alerts.test.ts`
  - Result: passed, 9 tests.
- `npx eslint lib/scan-alert-digest.ts tests/unit/scan-alert-digest.test.ts 'app/(app)/alerts/page.tsx' lib/mock-data.ts`
  - Result: passed.
- `git diff --check`
  - Result: passed.

## Open Decisions

- Whether the backend should persist explicit entered/exited counts in the alert
  run table later, instead of deriving them client-side from recent match
  history.
- Whether exited names should link to charts or remain plain text to avoid
  implying they are current scan matches.

## Known Risks

- If the live API only returns one run per alert, the UI falls back to
  `first tracked run` and cannot show exits until more history is returned.
- Client-side comparison is intentionally light and should be replaced by a
  backend summary if alert history grows large.

## Next Steps

1. Open a PR for review.
2. After merge, add a backend/API contract for returning the previous alert run
   or precomputed lifecycle counts.
3. Continue the roadmap with a chart-review/journal learning loop slice.

## PR

- Pending.
