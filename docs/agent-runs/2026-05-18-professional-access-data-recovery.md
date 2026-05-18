# Professional Access Cleanup + Production Data Recovery

Date: 2026-05-18

## Goal

Make AlphaVyuh read like a professional trading workflow platform instead of a beta surface, while checking whether the Railway Hobby backend can be recovered for production data.

## Agent Work

| Agent | Work done | Why it matters | Learned |
| --- | --- | --- | --- |
| Manager Agent | Coordinated copy cleanup, tests, backend recovery checks, and final evidence. | Keeps product, QA, and release work tied to one PR instead of scattered edits. | The repo already had strong guardrails; the main risk was stale product posture copy. |
| Product Copy Agent | Identified visible beta/founder/waitlist language and replacement wording. | Users now see Professional Access, EOD market data, broker import, journal capture, and execution-not-enabled language. | Safety copy can be confident without sounding unfinished. |
| Frontend Polish Agent | Removed legacy beta posture from public, auth, app, chart, broker, billing, and data surfaces. | The product feels more mature while preserving broker/order safety. | Small repeated labels create a large trust impression across the app. |
| QA Agent | Updated assertions and added a customer-facing legacy-posture route sweep. | Prevents future regressions into old launch-state language. | Playwright mock and release configs must be run with the correct auth mode. |
| Backend Recovery Agent | Checked Railway CLI status and production API health. | Confirms data is still blocked at deployment, not frontend API normalization. | Railway CLI token remains expired; production backend still returns Railway fallback 404. |

## Changes

- Replaced visible private/founder/beta posture copy with Professional Access language.
- Reworded order/broker copy around broker import, journal capture, and execution not enabled yet.
- Renamed visible data provenance copy from beta provider/broker wording to provider/import wording.
- Updated login, landing, access guide, onboarding, dashboard, watchlist, full chart, journal, settings, broker, data, alerts, products, and terms copy.
- Updated tests to assert Professional Access copy and block legacy beta posture language on customer-facing routes.
- Follow-up cleanup removed remaining active-code/backend references to private/founder beta posture from order, payment, config, and safety-test messages.
- Added `npm run recover:railway-backend` as a guarded post-login recovery helper for the Railway backend deploy and production API smoke.
- Added an optional `RUN_RAILWAY_BACKEND_RECOVERY=1 npm run launch:check` path so launch readiness can run the same backend recovery after Railway login.
- Confirmed production Vercel `NEXT_PUBLIC_API_URL` points to the intended Railway backend, so the current empty-data failure is backend deployment recovery rather than frontend env drift.
- Improved `npm run check:production-api` to identify Railway fallback responses when the backend app is not attached/deployed.

## Validation

- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm --prefix frontend run test -- --run` passed: 67 tests.
- `backend/.venv/bin/python -m pytest backend/tests/test_charts.py backend/tests/test_brokers_router.py backend/tests/test_broker_order_safety.py backend/tests/test_auth_middleware.py backend/tests/test_security_hardening.py backend/tests/test_market_overview_failsoft.py backend/tests/test_fundamentals_failsoft.py` passed: 34 tests.
- `npm audit --audit-level=moderate` passed: 0 vulnerabilities.
- `backend/.venv/bin/python -m pip_audit -r backend/requirements.txt` passed: no known vulnerabilities.
- `npm run test:e2e:mock` passed: 10 tests.
- `npm run test:e2e:layout` passed: 16 tests.
- `npm run test:e2e:perf` passed: 2 tests.
- `npm run test:e2e:release` passed: 6 tests.
- Local browser smoke covered login, landing, access guide, onboarding, dashboard, scanner, watchlist, full chart, journal, broker settings, and data page with no console errors and no legacy beta posture copy found.
- Follow-up focused validation passed:
  - `backend/.venv/bin/python -m pytest backend/tests/test_payments.py backend/tests/test_broker_order_safety.py backend/tests/test_brokers_router.py backend/tests/test_security_hardening.py` passed: 35 tests.
  - `npm run lint` passed.
  - `npm run test:e2e:layout` passed: 16 tests.
  - `bash -n scripts/recover-railway-backend.sh` passed.
  - `bash -n scripts/launch-readiness-check.sh` passed.
  - `npm run typecheck` passed.
  - `npm run recover:railway-backend` correctly stopped before deployment because Railway auth is still expired.
  - Production Vercel env inspection confirmed `NEXT_PUBLIC_API_URL` targets the Railway production backend.
  - `npm --prefix frontend run test -- --run tests/unit/api-base.test.ts` passed: 3 tests.
  - `PRODUCTION_API_URL=https://alphavyuh-production.up.railway.app npm run check:production-api` now fails with an explicit Railway fallback deployment hint.

## Production Data Recovery Status

Blocked by Railway authentication/deployment state:

- `railway status --json` fails with `invalid_grant` and `Unauthorized. Please run railway login again.`
- `PRODUCTION_API_URL=https://alphavyuh-production.up.railway.app npm run check:production-api` fails because `/health` returns Railway fallback `404 Application not found`.
- `curl -i https://alphavyuh-production.up.railway.app/health` confirms `x-railway-fallback: true`.
- Rechecked on 2026-05-18 after the Professional Access cleanup; Railway auth and production `/health` remain in the same blocked state.

Next required owner action:

1. Run `railway login` locally for the AlphaVyuh Railway account.
2. Run `npm run recover:railway-backend`.
3. If the repo is not linked, run `cd /Users/PRASAANTH/alphavyuh/backend && railway link`, then rerun `npm run recover:railway-backend`.
4. The helper deploys the backend, waits for `/health`, prints recent Railway logs on failure, and runs `PRODUCTION_API_URL=https://alphavyuh-production.up.railway.app npm run check:production-api`.

## Remaining Risks

- Production market data cannot appear on alphavyuh.com until the Railway backend deployment is restored or the frontend points to a working API host.
- Live broker order placement remains intentionally disabled.
- No Supabase schema changes were made.
