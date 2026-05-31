# 2026-05-31 - Review board summary handoff

## Scope
- Added a board-level review summary for the multi-chart setup review workspace.
- The summary captures each loaded symbol's decision, review score, W/M context, blockers, RS/52W/volume evidence, source/as-of trust, five-year contract status, alert draft trigger/invalidation, and original scanner context when present.
- Added a `Copy review notes` action to the review board so traders can carry the comparison session into watchlist notes, journal review, or founder QA without fabricating missing scanner context.
- No TradingView Advanced Charts, broker order behavior, data-provider change, or schema migration was introduced.

## Validation
- `npm --prefix frontend run test -- multi-chart-review.test.ts`
- `npm run test:setup-review-check`
- `npm --prefix frontend run typecheck`
- `npm run lint`
- `git diff --check`

## Remaining risk
- This is a copy/export handoff for the existing local workflow state. Durable server-side review-board history remains a later product slice.
