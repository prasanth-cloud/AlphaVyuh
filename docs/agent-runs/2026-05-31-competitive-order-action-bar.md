# Competitive Broker Order Action Bar Slice

Date: 2026-05-31

## Scope

Implement the Broker-Connected Order Action Bar slice from the queued
Competitive Intelligence Orchestrator goal. Centralize broker action-bar copy
and button state while preserving AlphaVyuh's current journal-only order capture
posture.

## Branch And Worktree

- Branch: `codex/competitive-order-action-bar`
- Worktree: `/private/tmp/alphavyuh-competitive-order-action-bar`

## Files Changed

- `frontend/lib/broker-safety.ts`
- `frontend/tests/unit/broker-safety.test.ts`
- `frontend/app/(app)/watchlist/page.tsx`
- `docs/agent-runs/2026-05-31-competitive-order-action-bar.md`

## Implementation Notes

- Added `brokerOrderActionBarPresentation` as a tested safety presenter for
  order-action mode, detail copy, primary button label, disabled state, and
  future live-confirmation requirements.
- Reused the presenter in the watchlist order panel so the UI fails closed when
  broker status is unavailable and stays journal-only while live routing is
  disabled.
- Preserved `canRouteLiveOrder = false`.
- Did not add broker API calls, live/sandbox order execution, production
  mutations, Supabase changes, deployments, or derivatives functionality.

## Tests Run

- `npm --prefix frontend run test -- tests/unit/broker-safety.test.ts`
  - Result: passed, 10 tests.
- `npx eslint lib/broker-safety.ts tests/unit/broker-safety.test.ts 'app/(app)/watchlist/page.tsx'`
  - Result: passed.
- `git diff --check`
  - Result: passed.

## Open Decisions

- Whether the chart page should reuse the same presenter once the scanner
  workbench/chart side panel work lands.
- Whether a future owner-approved live route should be sandbox-first or remain
  fully disabled until another explicit broker validation goal.

## Known Risks

- The watchlist order panel remains dense. This slice centralizes safety state
  but does not redesign the panel.
- The future live-confirmation branch is covered by unit tests, but no live route
  is reachable because `canRouteLiveOrder` remains false.

## Next Steps

1. Open a PR for review.
2. Merge after signal freshness, scan alerts, and watchlist prioritizer.
3. Use this presenter in the larger scanner workbench side panel if broker
   action context is shown there.

## PR

- [#320](https://github.com/prasanth-cloud/AlphaVyuh/pull/320)
