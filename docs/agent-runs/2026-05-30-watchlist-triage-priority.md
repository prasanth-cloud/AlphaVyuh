# 2026-05-30 Watchlist Triage Priority Slice

Issue: #282
Branch: `codex/issue-282-watchlist-triage`

## Scope

- Added the next setup-review slice for watchlist prioritization: the watchlist desk now ranks names by review priority using scanner context, workflow decisions, market signals, review debt, freshness, pins, tags, and notes.
- Kept the change frontend-only. No broker, order routing, production data mutation, schema migration, or TradingView Advanced Charts behavior changed.

## Changes

- Added `frontend/lib/watchlist-triage.ts` to score and explain queue priority.
- Changed the default watchlist sort to `Review priority`, while preserving manual order as an explicit desk control.
- Added priority labels to watchlist rows and a selected-symbol triage summary showing score and reasons.
- Expanded the `Needs review` queue view to include journal review debt and workflow `review_later` state, not just missing watchlist notes.

## Validation

- `npm exec -- vitest run tests/unit/watchlist-triage.test.ts tests/unit/scanner-review-context.test.ts tests/unit/workflow.test.ts` passed: 3 files, 12 tests.
- `npm run typecheck` passed.
- `npm run lint` passed.

## Follow-up

- #282 still needs saved scan composition, sector/industry strength ranking, drawing/measurement MVP, and scanner/alert run history.
