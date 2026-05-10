# UI/UX Excellence Pass — 2026-05-09

## Objective

Make AlphaVyuh feel faster and more intentional without adding decorative UI or changing trading logic. This pass focuses on workflow speed, decision clarity, and reducing cognitive load across the authenticated trading desk.

## What changed

### App shell command search
- The top search now finds both symbols and workflow destinations.
- `/` focuses search, and commands such as Scanner, Watchlist, Full Chart, Journal, Broker Settings, and Data Status route directly.

User impact: traders spend less time hunting through navigation and can jump from market context to the next workflow step quickly.

### Scanner triage
- Scanner rows now show setup score/grade in a compact column.
- Row actions are tighter: Shortlist, Chart, Ignore, Add, and More.
- More includes Review later, Journal, and Report.
- Expanded rows now show “Why this matched” plus a clear “Next action.”
- Report uses the existing feedback/data-issue path instead of a dead route.

User impact: traders can quickly decide whether a stock is worth review, add it to a watchlist, or report bad data without scanning a cluttered action row.

### Watchlist Decision Desk
- The Decision Desk now shows a “Next best action” panel when a plan is incomplete.
- Ready/order states explain missing fields, invalid stop/target placement, weak risk/reward, or low setup quality.
- Valid plans show “Plan ready” with risk/reward context.

User impact: traders get concrete planning guidance instead of guessing why an order or ready state is blocked.

### Order safety context
- The order ticket now shows compact R:R, risk amount, and mode indicators.
- It also surfaces safety nudges before draft order creation.

User impact: order drafting remains gated, but the trader can see what to fix and what risk they are taking before moving forward.

### Journal review loop
- The Journal review queue now has a direct “Review now” action when trades need review.
- When there are no pending reviews, the action shifts toward logging the next trade.

User impact: the product closes the learning loop faster by turning review status into a clear next action.

## What stayed unchanged

- No charting library changes.
- No broker execution changes.
- No billing changes.
- No Supabase schema changes.
- No production data changes.
- No workflow behavior removed.

## Validation evidence

- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm --prefix frontend run test -- --run` — passed, 49 tests.
- `npm run test:e2e:mock` — passed, 9 tests.
- `npm run test:e2e:layout` — passed, 13 tests.
- `npm run test:e2e:perf` — passed, 2 tests.
- `npm audit --audit-level=moderate` — passed, 0 vulnerabilities.

## Remaining high-value UX opportunities

- Add lightweight telemetry around command search usage and scanner-to-watchlist conversion.
- Add saved scanner views based on the highest-converting presets.
- Add post-trade coaching summaries once enough journal data exists.
- Continue reducing market-data latency through backend snapshots and cache warming rather than adding front-end decoration.
