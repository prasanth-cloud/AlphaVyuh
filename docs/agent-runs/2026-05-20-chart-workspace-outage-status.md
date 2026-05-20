# Chart Workspace Outage Status

Date: 2026-05-20
Branch: `codex/chart-workspace-outage-status`

## Scope

Closed the chart workspace false-empty path where Supabase read failures could be presented as empty chart workspaces or drawings, risking user annotation loss on subsequent saves.

## Changes

- `GET /api/v1/charts/{symbol}/workspace`, `/drawings`, and `/layout` now preserve true no-row defaults but return `503 Chart workspace is temporarily unavailable.` when the workspace store cannot be read.
- Drawing and layout write paths that first read the existing workspace now stop on workspace read outages instead of appending to, or saving over, a synthetic empty workspace.
- Live frontend chart drawing/workspace reads now reject outage and unavailable payloads instead of returning false-empty data. Cached live workspaces remain available as a stale-preserving fallback.
- The chart page preserves same-chart drawings on transient read failures and shows a compact "Drawings unavailable" state.
- `useChartWorkspace` preserves current indicator/drawing state on load failures and exposes the error for consumers.

## Verification

- `pytest backend/tests/test_charts.py` - passed, 18 tests.
- `npm test -- tests/unit/mock-chart-persistence.test.ts` - passed, 6 tests.
- `npm run typecheck` - passed.
- `npm run test:production-api-check` - passed.
- `npm run test:production-smoke-env-check` - passed.
- `npm run test:e2e:mock` - passed, 12 tests.
- `npm --prefix frontend exec -- playwright test --config=frontend/playwright.mock.config.ts frontend/tests/e2e/chart-drawings.spec.ts` - passed, 3 tests.

## Remaining Guardrails

- `python -m pip_audit -r backend/requirements.txt` currently fails on transitive `pyjwt 2.12.1` with `PYSEC-2025-183`; pip-audit lists no fixed version. The backend app's local Supabase JWT validation uses stdlib HMAC rather than PyJWT.
- `npm run check:data-recovery` still fails because Railway production API returns fallback 404 `Application not found`, required GitHub recovery secrets are missing, no Railway Backend Recovery workflow run exists, and local Railway CLI OAuth needs re-login. Supabase EOD data, Vercel production env, and chart smoke config pass.
