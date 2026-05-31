# Competitive Signal Explain Slice

Date: 2026-05-31

## Scope

Implement the first low-collision slice from the queued Competitive Intelligence
Orchestrator goal: strengthen scanner signal explanations with data freshness
and trust-state language before any larger scanner workbench UI changes.

## Branch And Worktree

- Branch: `codex/competitive-signal-explain`
- Worktree: `/private/tmp/alphavyuh-competitive-signal-explain`

## Files Changed

- `frontend/lib/scanner-match-explanation.ts`
- `frontend/tests/unit/scanner-match-explanation.test.ts`
- `docs/agent-runs/2026-05-31-competitive-signal-explain.md`

## Implementation Notes

- Added market-session freshness classification to scanner match explanations.
- Added explicit warnings for degraded, missing, future-dated, aging, and stale
  trust metadata.
- Added a freshness context row and freshness metric tone so later UI drawers can
  render the trust state without reimplementing classification logic.
- Stale or degraded trust metadata now changes the suggested next action to
  `Check data before planning`.
- Kept scope cash-equity only and did not add broker, Supabase, deployment, or
  production mutations.

## Tests Run

- `npm --prefix frontend run test -- tests/unit/scanner-match-explanation.test.ts`
  - Result: passed, 4 tests.

## Open Decisions

- Whether the later scanner workbench drawer should render freshness as a
  prominent status pill or keep it inside the existing explanation details.
- Whether a database-backed alert/session audit should consume the same
  freshness classification after alert history is prioritized.

## Known Risks

- Freshness is calendar-day based, not exchange-calendar aware. The current
  thresholds tolerate normal weekend lag, but exchange holidays could benefit
  from a future market-calendar helper.
- The scanner page is dense; later UI work should avoid adding another bulky
  panel until this signal can be tested in the existing row expansion.

## Next Steps

1. Open a PR for review.
2. Merge before scanner workbench UI changes so the UI can reuse this pure
   freshness signal.
3. Continue with the Saved Scan Alerts slice after this branch is green.

## PR

- [#317](https://github.com/prasanth-cloud/AlphaVyuh/pull/317)
