# Price Alert Outage Status

Date: 2026-05-20
Branch: `codex/price-alert-outage-status`

## Scope

Closed a false-empty price alert path where production alert-store failures could look like a trader had no active chart alerts.

## Changes

- `GET /api/v1/price-alerts` now preserves valid empty alert lists but returns `503 Price alerts are temporarily unavailable.` when the alert store cannot be read.
- Price alert create/delete paths now return the same service-unavailable status when limit checks, inserts, or deletes cannot reach the store.
- `getPriceAlerts()` now rejects backend service errors, unavailable payloads, and malformed responses instead of returning `[]`.
- `deletePriceAlert()` now rejects failed deletes so the chart does not remove an alert locally when the backend did not confirm deletion.
- The chart page surfaces an alerts-unavailable state in the toolbar/modal and preserves same-symbol alert state when possible.

## Verification

- `pytest backend/tests/test_price_alerts_outage_status.py` - passed, 5 tests.
- `npm test -- tests/unit/price-alerts-api.test.ts` - passed, 5 tests.
- `npm run typecheck` - passed.
- `npm run test:production-api-check` - passed.
- `npm run test:production-smoke-env-check` - passed.
- `python -m pip_audit -r backend/requirements.txt --disable-pip --no-deps --progress-spinner off` - passed.
- `npm run test:e2e:mock` - passed, 12 tests.
- `npm --prefix frontend exec -- playwright test --config=frontend/playwright.mock.config.ts frontend/tests/e2e/chart-drawings.spec.ts` - passed, 3 tests.

## Remaining Guardrails

- Full dependency audit without `--no-deps` remains blocked by transitive `pyjwt 2.12.1` / `PYSEC-2025-183`, which currently lists no fixed version. Local Supabase JWT validation uses stdlib HMAC.
- `npm run check:data-recovery` still fails because Railway production API returns fallback 404 `Application not found`, required GitHub recovery secrets are missing, no Railway Backend Recovery workflow run exists, and local Railway CLI OAuth needs re-login. Supabase EOD data, Vercel production env, and chart smoke config pass.
