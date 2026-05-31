# 2026-05-30 Scanner Why-Matched Slice

Issue: #282
Branch: `codex/issue-282-why-matched`

## Scope

- Added the next setup-review slice for scanner explainability: every expanded scanner result now connects the matched conditions to latest values, setup quality, sector context, source, coverage, and as-of date.
- Kept the change frontend-only; no schema, broker, order, realtime data, or TradingView Advanced Charts behavior changed.

## Changes

- Added `frontend/lib/scanner-match-explanation.ts` as a focused formatter for scanner reason, confirmation, metric, trust, and next-action copy.
- Updated the scanner table row expansion to show:
  - triggered conditions
  - confirmation reasons
  - latest values behind the match
  - scan/sector/source/as-of/coverage context
  - data warnings and suggested next action
- Added a compact row-level “Matched:” teaser so a trader can scan the table without opening every row.

## Validation

- `npm exec -- vitest run tests/unit/scanner-match-explanation.test.ts tests/unit/scanner-review-context.test.ts tests/unit/scanner-workflow.test.ts` passed: 3 files, 8 tests.
- `npm run typecheck` passed.
- `npm run lint` passed.

## Follow-up

- #282 still needs saved scan composition, richer sector/industry strength ranking, drawing/measurement MVP, watchlist triage ranking, and alert/run history.
