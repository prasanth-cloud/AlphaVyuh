# Competitive Watchlist Prioritizer Slice

Date: 2026-05-31

## Scope

Implement the Watchlist Prioritizer slice from the queued Competitive
Intelligence Orchestrator goal. Improve review-priority scoring with sector,
relative-strength, and broker-context signals while avoiding changes to broker
execution or the dense watchlist page layout.

## Branch And Worktree

- Branch: `codex/competitive-watchlist-prioritizer`
- Worktree: `/private/tmp/alphavyuh-competitive-watchlist-prioritizer`

## Files Changed

- `frontend/lib/watchlist-triage.ts`
- `frontend/tests/unit/watchlist-triage.test.ts`
- `docs/agent-runs/2026-05-31-competitive-watchlist-prioritizer.md`

## Implementation Notes

- Added explicit RS-score and sector-context contributions to watchlist triage.
- Added broker-context scoring support for connected, expired, plan-gated,
  unavailable, not-connected, and linked-order states.
- Existing watchlist UI already renders triage reasons, so RS/sector/broker-link
  context can surface without editing the page layout.
- Kept live order routing unchanged and did not touch broker mutations,
  production data, Supabase, or deployment configuration.

## Tests Run

- `npm --prefix frontend run test -- tests/unit/watchlist-triage.test.ts`
  - Result: passed, 4 tests.
- `npx eslint lib/watchlist-triage.ts tests/unit/watchlist-triage.test.ts 'app/(app)/watchlist/page.tsx'`
  - Result: passed.
- `git diff --check`
  - Result: passed.

## Open Decisions

- Whether a future watchlist UI polish should expose broker readiness as a
  dedicated status chip instead of a triage reason.
- Whether sector strength should become a shared market-context object once the
  scanner workbench and watchlist both need the same sector ranking.

## Known Risks

- Broker readiness is an optional pure context input. The current page gets
  broker-linked workflow reasons automatically, but live broker status should be
  wired only after order-action surface work defines the shared component.
- Triage reason output is capped, so some lower-priority market reasons may be
  omitted when higher-priority context is present.

## Next Steps

1. Open a PR for review.
2. Merge after the signal freshness and scan-alert semantics PRs.
3. Continue with the Broker Order Action Bar slice before the larger scanner
   workbench composition.

## PR

- [#319](https://github.com/prasanth-cloud/AlphaVyuh/pull/319)
