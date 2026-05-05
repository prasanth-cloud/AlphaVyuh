# Workflow OS Completion Audit

Audit date: 2026-05-05

Scope: PR #54, `pivot/workbench-positioning-20260502-1207`.

Objective: make AlphaVyuh feel like a polished, fast, workflow-first trading
operating system for Indian swing traders while preserving the existing stack,
routes, `lightweight-charts`, Supabase auth/data model, broker adapter
structure, and dark AlphaVyuh aesthetic.

## Status Summary

Overall status: **not complete until the owner-controlled migration and broker
validation gates are complete**.

The product workflow and local/repeatable verification gates are implemented:

Dashboard -> Scanner -> Shortlist -> Watchlist Decision Desk -> Full Chart ->
Order Draft/Broker -> Journal -> AI Review/Coaching

The remaining unverified requirements are intentionally outside local automated
CI:

- `supabase/migrations/20260505014955_workflow_state.sql` must be applied to
  staging and prod by the account owner, then the required PR evidence marker
  can be added.
- Live/sandbox broker submission against an actual broker account must be
  explicitly confirmed by the account owner. Read-only broker smoke scripts
  exist for Zerodha and Upstox; order submission must remain manual and
  explicitly confirmed.

## Requirement-To-Artifact Checklist

| Requirement | Evidence | Status |
|---|---|---|
| Preserve current stack, routes, Supabase model, broker adapter structure, dark aesthetic | Existing Next/FastAPI/Supabase layout retained. No state/UI library swap. Broker additions are in `backend/app/brokers/*` and `frontend/lib/brokers/adapter.ts` contract path. | Covered |
| Do not swap `lightweight-charts` | Dependency remains in `frontend/package.json`; chart work is in `frontend/app/(app)/charts/[symbol]/page.tsx`. | Covered |
| Latency/data reliability and fail-soft backend routes | Fail-soft routes and cache paths covered by `frontend/tests/e2e/backend-live-smoke.spec.ts`, `backend/tests/test_market_overview_failsoft.py`, `backend/tests/test_market_data_provider.py`, `backend/tests/test_fundamentals_failsoft.py`, `frontend/tests/unit/candles-cache.test.ts`, and timing marks in `frontend/lib/performance.ts`. | Covered locally |
| Data freshness badges on dashboard/scanner/watchlist/chart | Data freshness/provenance components and page usage in `frontend/components/DataFreshnessStrip.tsx`, `frontend/components/ui/DataProvenanceBadge.tsx`, dashboard/scanner/watchlist/chart files. | Covered by code inspection and browser smoke |
| Scanner workflow upgrade: rail, row/bulk lifecycle actions, shortlist/watchlist flow | `frontend/app/(app)/scanner/page.tsx`; workflow E2E covers scan -> Shortlist/Ignore/Review later, row-level Add to watchlist persistence, and create watchlist from scanner results in `frontend/tests/e2e/workflow-mock.spec.ts`. | Covered |
| Watchlist Decision Desk with lifecycle/plan fields and gating | `frontend/app/(app)/watchlist/page.tsx`, `frontend/lib/workflow.ts`; E2E covers Ready/order gating, Prev/Next buttons, ArrowUp/ArrowDown queue navigation, and local persistence in `workflow-mock.spec.ts`. | Covered |
| Persist workflow state to Supabase with RLS and local fallback | Migration `supabase/migrations/20260505014955_workflow_state.sql`, backend router `backend/app/routers/workflow.py`, service `backend/app/services/workflow_state.py`, frontend fallback in `frontend/lib/api.ts`. Remote staging/prod application is not verified. | Covered locally; remote gate open |
| Full chart drawing tools, persistence, Delete/Esc, plan/alert/zone connections | `frontend/app/(app)/charts/[symbol]/page.tsx`; drawing E2E covers Trendline, Ray, Horizontal, H-Ray, Zone, Fib, Long/Short Position, Text, reload persistence, Delete, Esc, risk/reward plan fill, zone note creation. `frontend/tests/unit/mock-chart-persistence.test.ts` covers local-first workspace fallback when the API save fails. | Covered locally |
| Indicators are modular registry entries with unit tests | `frontend/components/charts/indicators/*`, registry in `frontend/components/charts/indicators/registry.ts`, tests in `frontend/tests/unit/charts/indicators.test.ts`. | Covered |
| Broker adapter path: Zerodha first, Upstox second, simulated fallback, live confirmation | Zerodha remains the primary route; Upstox OAuth/order lifecycle in `backend/app/brokers/upstox/*`; order safety in `backend/app/routers/broker.py`; tests in `backend/tests/test_broker_order_safety.py`, `backend/tests/test_upstox_adapter.py`, `backend/tests/test_brokers_router.py`. | Covered except real broker execution |
| Never store broker passwords / never bypass broker security / confirm live order | Credential storage stays token-based/encrypted; live order confirmation enforced by backend and UI copy; read-only smoke scripts avoid live order mutation. | Covered by code/tests for local paths |
| Journal auto-create/update and coaching cards | Order/journal sync in `backend/app/routers/broker.py`, close workflow sync in `backend/app/routers/journal.py`, coaching in `backend/app/routers/ai.py`, dashboard/journal UI. `frontend/tests/unit/candles-cache.test.ts` covers AI-pattern request coalescing/fail-soft behavior. | Covered by backend/unit and mock workflow tests |
| Visual polish without unrelated redesign | Main workflow pages changed in place; no broad UI library or route replacement. Browser smoke checks workflow surfaces. | Covered locally |
| Required checks are repeatable | `scripts/launch-readiness-check.sh` runs lint, typecheck, unit tests, production build, audits, mock workflow browser smoke, live-backend HTTP smoke, and focused backend tests. | Covered |
| Small commits and PR update | Conventional commits are on PR #54; PR description records latency, validation, migration, and broker gates. | Covered |

## Current Verification Gates

Primary gate:

```bash
npm run launch:check
```

Latest focused gate result recorded on 2026-05-05 after head `3800860`:

- `npm run typecheck`: passed
- `npm run lint`: passed
- `npm --prefix frontend run test -- --run`: 33 passed
- `npm run test:e2e:mock`: 5 passed, including scanner lifecycle, scanner
  row-level Add to watchlist persistence, watchlist Prev/Next and
  ArrowUp/ArrowDown queue navigation, order gating, and drawing persistence

Latest full launch gate result recorded on 2026-05-05 before later focused
additions:

- Frontend lint: passed
- Frontend typecheck: passed
- Frontend unit tests: 29 passed at that time; current focused unit suite is
  33 passed
- Frontend production build: passed
- Frontend dependency audit: 0 vulnerabilities
- Mock workflow browser smoke: 5 passed
- Mock workflow performance smoke: passed
- Mock workflow layout smoke: passed
- Live-backend HTTP smoke: 3 passed
- Backend focused tests: 40 passed at that time
- Backend dependency audit: no known vulnerabilities

Additional previously run gates:

- `backend/.venv/bin/python -m pytest backend/tests`: 158 passed
- `npx playwright test --config=playwright.mock.config.ts tests/e2e/full-ui-qa.spec.ts`: 2 passed
- Vercel PR deployment: `dpl_3xXEVAhZpHY5hdMDYRoQ3vHwwVj5` is Ready on
  head `3800860`

## Remaining Owner-Controlled Gates

### Migration drift

PR #54 currently has a failing `Migration Drift Check` because
`supabase/migrations/20260505014955_workflow_state.sql` is new in the PR and
the PR description does not contain the required evidence marker. The latest
check observed on 2026-05-05 reported:

- prod applied migrations: 33
- local non-stub migration files: 36
- new migration in this PR: `20260505014955_workflow_state.sql`

Do not add the evidence marker until the migration is actually applied to
staging and prod and the schema is verified.

### Broker validation

Real broker validation is not complete.

Read-only account smoke is available:

```bash
npm run broker:smoke
BROKER_SMOKE_TARGET=kite npm run broker:smoke
BROKER_SMOKE_TARGET=upstox npm run broker:smoke
BROKER_SMOKE_TARGET=kite npm run broker:smoke -- --login-url
BROKER_SMOKE_TARGET=upstox npm run broker:smoke -- --login-url
BROKER_SMOKE_TARGET=kite npm run broker:smoke -- --request-token <request_token>
BROKER_SMOKE_TARGET=upstox npm run broker:smoke -- --code <authorization_code>
RUN_BROKER_SMOKE=1 npm run launch:check
RUN_BROKER_SMOKE=1 BROKER_SMOKE_TARGET=kite npm run launch:check
RUN_BROKER_SMOKE=1 BROKER_SMOKE_TARGET=upstox npm run launch:check
```

The broker smoke script and launch gate run `backend/scripts/test_kite_connection.py` and
`backend/scripts/test_upstox_connection.py`. Those scripts verify account/data
reads only and do not submit, modify, or cancel orders.

Evidence should be recorded with `docs/broker-validation-record.md`; tokens,
API secrets, and private account identifiers must be masked.

Latest local attempt on 2026-05-05 stopped before any broker API call because
`KITE_ACCESS_TOKEN` and `UPSTOX_ACCESS_TOKEN` were not present in
`backend/.env`. No order placement was attempted.

The manual order-submission protocol is documented in
`docs/customer-launch-runbook.md#11-broker-execution-gate`.

Live or sandbox order submission must not be automated by default. It requires
explicit account-owner confirmation of:

- broker
- sandbox vs live mode
- symbol
- side
- quantity
- order type
- price, if applicable
- expected journal and workflow-state outcome

Until both the migration gate and manual broker gate are completed with real
evidence, this audit must remain **not complete**.
