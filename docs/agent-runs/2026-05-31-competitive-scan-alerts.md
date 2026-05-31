# Competitive Scan Alerts Slice

Date: 2026-05-31

## Scope

Implement the Saved Scan Alerts slice from the queued Competitive Intelligence
Orchestrator goal. Clarify entry/exit review semantics for saved cash-equity
screens without adding new endpoints, migrations, notification providers, or
production mutations.

## Branch And Worktree

- Branch: `codex/competitive-scan-alerts`
- Worktree: `/private/tmp/alphavyuh-competitive-scan-alerts`

## Files Changed

- `frontend/lib/scan-alert-semantics.ts`
- `frontend/tests/unit/scan-alert-semantics.test.ts`
- `frontend/app/(app)/alerts/page.tsx`
- `frontend/app/(app)/scanner/page.tsx`
- `docs/agent-runs/2026-05-31-competitive-scan-alerts.md`

## Implementation Notes

- Added a pure helper that classifies saved scan filters as:
  - `Entry setup watch`
  - `Exit / risk review`
  - `Review watch`
- Added cadence copy for active, paused, skipped, and failed alert states.
- Rendered intent and cadence in the Saved Scan Alerts table so users know what
  a saved screen is doing before acting on the digest.
- Updated scanner alert creation copy to state that alerts run once after each
  completed cash-equity EOD session and are for review, not execution.
- Kept broker/order execution, deployment, Supabase, and notification delivery
  out of scope.

## Tests Run

- `npm --prefix frontend run test -- tests/unit/scan-alert-semantics.test.ts tests/unit/mock-scan-alerts.test.ts`
  - Result: passed, 11 tests.
- `npx eslint lib/scan-alert-semantics.ts tests/unit/scan-alert-semantics.test.ts 'app/(app)/alerts/page.tsx' 'app/(app)/scanner/page.tsx'`
  - Result: passed.
- `git diff --check`
  - Result: passed.

## Open Decisions

- Whether notification delivery should remain in-product only for now or later
  add email/Telegram behind explicit plan and provider gates.
- Whether the alert intent should eventually be user-selected instead of inferred
  from the saved screen filters.

## Known Risks

- Intent classification is heuristic because the existing alert API stores saved
  filters, not an explicit `intent` field. It avoids migrations for this slice
  but may need a first-class field when alert editing is expanded.
- The alert table is denser after adding intent/cadence copy; later UI polish
  should validate mobile wrapping before merging larger scanner workbench changes.

## Next Steps

1. Open a PR for review.
2. Merge after the signal freshness slice if both are green.
3. Continue with Watchlist Prioritizer or Broker Order Action Bar only after
   reviewing file-collision risk in `watchlist/page.tsx`.

## PR

- Pending.
