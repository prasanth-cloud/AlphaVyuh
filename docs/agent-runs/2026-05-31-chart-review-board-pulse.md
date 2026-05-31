# 2026-05-31 - Chart review board pulse

## Scope
- Added a board-level review pulse to the multi-chart setup review workspace.
- The pulse ranks the best loaded candidate, shows average review score, ready/watch/missing counts, the top shared blocker, and whether the board is using 5Y daily launch context.
- Reused existing W/M, RS, 52-week, moving-average, volume, source, and five-year contract data; no broker order behavior, data-provider change, TradingView Advanced Charts dependency, or schema migration was introduced.

## Validation
- `npm run test -- tests/unit/multi-chart-review.test.ts --reporter=dot` from `frontend/`
- `npm run lint` from `frontend/`
- `npm run test:setup-review-check`
- `npm --prefix frontend run typecheck`
- `git diff --check`

## Remaining risk
- This is still local review-board state. Durable server-side board sessions and richer user-owned playbook templates remain later product slices.
