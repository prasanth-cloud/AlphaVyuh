# Alerts History Contract

## Scope
- Branch: `codex/alerts-history-contract`
- Worktree: `/private/tmp/alphavyuh-alerts-history-contract`
- Objective: make live saved scan alerts return enough recent history for entry/exit digest comparisons without changing endpoint names or response shape.

## Files Changed
- `backend/app/routers/alerts.py`
- `backend/tests/test_scan_alerts.py`
- `frontend/lib/scan-alert-digest.ts`
- `frontend/tests/unit/scan-alert-digest.test.ts`

## What Changed
- `/api/v1/alerts/recent/matches` now accepts an optional `runs_per_alert` query parameter and defaults to two retained runs per saved alert.
- The backend fetch limit scales with the configured per-alert history cap while keeping the returned payload as `{ "matches": [...] }`.
- The alert digest builder now renders one current digest per alert and uses older runs only as comparison context, so history rows do not create duplicate UI cards.

## Tests Run
- `pytest tests/test_scan_alerts.py` from `backend/` -> 13 passed.
- `CI=1 ./node_modules/.bin/vitest run tests/unit/scan-alert-digest.test.ts tests/unit/mock-scan-alerts.test.ts --reporter=verbose` from `frontend/` -> 9 passed.
- `npm exec eslint lib/scan-alert-digest.ts tests/unit/scan-alert-digest.test.ts` from `frontend/` -> passed.
- `git diff --check` -> passed.

## Open Decisions
- Whether the UI should expose a user-selectable alert history depth later. Current API supports up to five runs per alert, but the default UI uses two.

## Known Risks
- The recent match endpoint still relies on Supabase ordering by `run_date desc`; if rows with identical dates ever need deterministic ordering, add a secondary server-side order.

## Next Steps
- Open PR, run GitHub checks, and merge after green.
- Follow with chart/watchlist/broker decision-cockpit slices from the active roadmap.
