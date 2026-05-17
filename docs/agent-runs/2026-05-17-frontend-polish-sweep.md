# Frontend Polish Sweep

Date: 2026-05-17
Branch: `codex/frontend-polish-sweep`
Issue: #105

## Agent Roster

- Manager: integrated scope, code changes, validation, PR handoff.
- Frontend Agent: audited clutter, hierarchy, overflow, and slow-feeling UI across dashboard, scanner, watchlist, full chart, journal, login, and onboarding.
- QA Agent: defined the smallest safe verification plan and screenshot evidence set.
- Product Agent: ranked what matters before founder-beta feedback: one obvious next action, trust clarity, and a simpler scanner/watchlist loop.

## What Changed

- Removed the duplicate dashboard phase card and compressed first-session setup into a single progress row.
- Renamed the dashboard workflow block to `Next actions` and reduced card height so market context and trader actions fit together above the fold.
- Simplified scanner row actions to `Shortlist`, `Chart`, and `More`; secondary actions now live behind `More`.
- Hid scanner bulk actions until at least one result is selected.
- Made shared data tables horizontally scrollable instead of clipping action columns on smaller widths.
- Suppressed existing input hydration noise in the app search and shared input primitive.
- Updated layout and mock e2e coverage for the cleaner scanner action model.

## Why

The product is close enough for founder-beta feedback, but the old dashboard and scanner chrome made users process too much before acting. This pass keeps AlphaVyuh's core flow intact while reducing repeated panels and moving secondary choices out of the primary path.

## What We Learned

- The highest-impact polish is not more UI; it is showing fewer things by default.
- Scanner actions should bias toward the next workflow step, not expose every lifecycle action in every row.
- Dashboard trust indicators are valuable, but duplicate market-context blocks quickly feel like latency or clutter.
- Screenshot capture surfaced hydration warnings that were not obvious in normal testing.

## Improve Next

- Create a separate watchlist information-architecture issue for collapsing deeper metadata until requested.
- Create a full-chart command-bar issue for the remaining dense toolbar decisions.
- Consider a shared compact provenance/status component so data trust stays visible without repeated copy.

## Screenshot Evidence

Captured under `docs/screenshots/frontend-polish-2026-05-17/`:

- Desktop: dashboard, scanner, watchlist, full chart, journal, login.
- Mobile: dashboard, scanner, watchlist, login, onboarding.

## Validation

- `npm run lint`
- `npm run typecheck`
- `npm --prefix frontend run test -- --run`
- `npm run test:e2e:layout`
- `npm run test:e2e:mock`
- `npm audit --audit-level=moderate`
- In-app browser smoke: dashboard shows compact setup progress, removed repeated command-center/workflow copy, and scanner rows expose only `Shortlist`, `Chart`, and `More`.
