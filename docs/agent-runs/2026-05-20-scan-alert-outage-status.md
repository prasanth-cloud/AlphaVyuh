# Scan Alert Outage Status

Date: 2026-05-20
Branch: `codex/scan-alert-outage-status`

## Scope

Closed false-empty scan alert paths where alert-store failures could look like a trader had no saved EOD scan alerts or no recent alert matches.

## Changes

- `GET /api/v1/alerts`, `GET /api/v1/alerts/recent/matches`, and per-alert match reads now preserve valid empty states but return `503 Scan alerts are temporarily unavailable.` when the alert store cannot be read.
- Scan alert create/update/delete paths now return the same service-unavailable status when ownership checks, limit checks, inserts, updates, or deletes cannot reach the store.
- `listAlerts()`, `getRecentAlertMatches()`, and `getAlertMatches()` reject service errors, unavailable payloads, and malformed responses instead of returning false-empty lists.
- `deleteAlert()` now rejects failed deletes so the alerts page does not remove a saved scan locally without backend confirmation.
- The `/alerts` page shows an explicit unavailable state and avoids rendering "No saved scan alerts yet" or "No EOD matches yet" during alert-service outages.

## Verification

- `pytest backend/tests/test_scan_alerts.py` - passed, 11 tests.
- `npm test -- tests/unit/mock-scan-alerts.test.ts` - passed, 7 tests.
- `npm run typecheck` - passed.
- `npm run test:production-api-check` - passed.
- `npm run test:production-smoke-env-check` - passed.
- `python -m pip_audit -r backend/requirements.txt --disable-pip --no-deps --progress-spinner off` - passed.
- `npm run test:e2e:mock` - passed, 12 tests.
- `NEXT_PUBLIC_FORCE_LIVE_DATA=true NEXT_PUBLIC_API_URL=http://localhost:8000 npm --prefix frontend exec -- playwright test --config=frontend/playwright.mock.config.ts frontend/tests/e2e/scan-alerts-unavailable.spec.ts` - passed, 1 test.

## Remaining Guardrails

- Full dependency audit without `--no-deps` remains blocked by transitive `pyjwt 2.12.1` / `PYSEC-2025-183`, which currently lists no fixed version. Local Supabase JWT validation uses stdlib HMAC.
- `npm run check:data-recovery` still fails because Railway production API returns fallback 404 `Application not found`, required GitHub recovery secrets are missing, no Railway Backend Recovery workflow run exists, and local Railway CLI OAuth needs re-login. Supabase EOD data, Vercel production env, and chart smoke config pass.
