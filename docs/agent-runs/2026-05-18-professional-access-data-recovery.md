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
| Chart Data Agent | Rechecked production Supabase rows and fixed candle-window selection to return the latest EOD bars oldest-to-newest. | Full chart and watchlist charts will show current EOD context once Railway is restored instead of stale early-history windows. | Supabase had fresh 2026-05-18 rows; the bug was backend ordering/serialization, not missing market data. |
| Release Hygiene Agent | Removed remaining active repo beta posture from issue templates and backend intraday errors. | Feedback intake and API errors now match the same Professional Access product posture as the app UI. | Historical docs can keep beta launch records, but active templates/errors should not reopen that language. |
| Operations Agent | Renamed active GitHub feedback templates and current runbooks away from beta/founder wording. | The operating layer now matches the product posture testers and contributors see in the app. | Even after UI cleanup, issue templates and runbooks can quietly preserve old positioning. |
| Data Verification Agent | Strengthened the production API smoke to require real breadth, deeper chart history, and optional authenticated scanner matches. | Backend recovery will now prove more than `/health`; it will catch shallow/stale chart data before traders see it. | Scanner verification needs an auth token, so the smoke supports an optional `PRODUCTION_API_BEARER_TOKEN` rather than weakening auth. |
| Public Posture Agent | Added a live public-site posture check for landing, login, access, and legacy beta redirect routes. | Launch checks now verify the visible website reads like Professional Access before sharing with traders. | The old live grep was too loose and tied to outdated landing-page copy. |

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
- Added `npm run test:production-api-check` and wired it into the Agent PR Gate so the Railway fallback diagnosis is regression-tested.
- Created GitHub launch blocker issue [#137](https://github.com/prasanth-cloud/AlphaVyuh/issues/137) for the owner-gated Railway backend recovery.
- Added a manual `Railway Backend Recovery` GitHub Actions workflow so production recovery can run from GitHub after the owner adds `RAILWAY_TOKEN` and provides the Railway project/service inputs. The workflow fails fast if the token secret is missing.
- Fixed the candle endpoint to fetch the latest available EOD window and return it oldest-to-newest for chart rendering.
- Hardened candle serialization so missing indicator fields become `null` instead of leaking `NaN` into JSON responses.
- Tightened `npm run check:production-api` so it now fails if the smoke-tested RELIANCE candles are stale versus the market summary date.
- Replaced remaining active GitHub issue-template and backend error references to beta/founder posture with Professional Access wording.
- Made the manual Railway Backend Recovery workflow accept optional `RAILWAY_PROJECT_ID`, `RAILWAY_SERVICE`, and `RAILWAY_WORKSPACE` secrets so owner inputs do not need to be retyped on every run.
- Improved the recovery script diagnostics so, when `RAILWAY_TOKEN` is present but the repo is not linked, it prints visible Railway projects and tells the operator which project/service values are missing.
- Fixed the recovery script to run Railway status and fallback log commands from `backend/`, matching the directory where the project is linked and deployed.
- Promoted the access guide to canonical `/access` and made legacy `/beta` redirect there so public navigation no longer points at beta-branded URLs.
- Replaced the Supabase invite email's founder-beta wording with Professional Access account language.
- Replaced backend live-source metadata's `beta` confidence/default license wording with account-scoped provider language.
- Reworked `/access` from a tester/research page into a professional access overview with workflow, included capabilities, support, and data/execution policy.
- Added a top-bar Data API outage signal so authenticated screens show `Data API down` instead of implying the latest EOD session is reachable when Railway returns fallback 404.
- Reworded market-data outage errors from live-data language to EOD-compatible market-data service language.
- Added an explicit Data Status page outage state so the dedicated health page says `DATA API DOWN` and points recovery work at the market-data service instead of showing a vague `CHECK DATA` state.
- Moved the authenticated admin access queue from `/admin/beta` to `/admin/access`, while keeping `/admin/beta` as a compatibility redirect.
- Removed the visible `FOUNDER100` billing access-code default from Settings and replaced it with a neutral Professional Access code input.
- Added a Professional Access payment-code API path at `/api/v1/payments/access/apply`; the old `/founder/apply` path remains as a compatibility alias.
- Normalized admin-created invite codes to the `professional_access` plan while accepting legacy stored `founder` invite rows as compatible.
- Renamed active GitHub issue templates from beta-specific filenames to Professional Access product/workflow templates.
- Reworded active operations docs for EOD refresh, release readiness, customer launch, and mission control from beta/founder posture to Professional Access posture.
- Strengthened `npm run check:production-api` to validate market breadth counts, at least 120 RELIANCE daily candles spanning at least 180 days, and optional authenticated scanner matches when `PRODUCTION_API_BEARER_TOKEN` is provided.
- Added `npm run check:public-posture` and wired `LIVE_URL=... npm run launch:check` to verify Professional Access public copy and reject legacy beta posture across `/`, `/login`, `/access`, and `/beta`.

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
  - `npm run test:production-api-check` passed.
  - `bash -n scripts/recover-railway-backend.sh` passed after adding explicit project-link support.
- Chart recovery follow-up validation passed:
  - Supabase read-only check found latest `daily_ohlcv` date `2026-05-18` with 3,147 symbols.
  - `backend/.venv/bin/python -m pytest backend/tests/test_charts.py` passed: 9 tests.
  - Local backend smoke against production Supabase passed: `ALLOW_LOCAL_API_CHECK=1 PRODUCTION_API_URL=http://127.0.0.1:8017 npm run check:production-api`.
  - Local `RELIANCE` daily candles with `limit=500` now return `2024-05-30` through `2026-05-18`; `limit=3000` returns all 1,301 available rows from `2021-05-03` through `2026-05-18`.
  - `npm run test:production-api-check` now covers Railway fallback, stale chart candles, and healthy current candles.
  - Local production API checker against the Supabase-backed backend passed with `RELIANCE candles 5 through 2026-05-18`.
  - Active-code posture sweep now finds no legacy beta wording outside the intentional Playwright forbidden-copy assertion.
  - `bash -n scripts/recover-railway-backend.sh` passed after recovery input improvements.
  - `bash -n scripts/recover-railway-backend.sh` passed after aligning Railway status/log checks with the backend working directory.
  - `backend/.venv/bin/python -m pytest backend/tests/test_market_context.py` passed after replacing live-source beta metadata.
  - `npm run typecheck` passed after adding canonical `/access` and redirecting `/beta`.
  - Active customer-facing code/template sweep no longer finds legacy beta posture copy in `frontend/app`, `frontend/components`, `frontend/lib`, `backend/app`, or `supabase/templates`.
  - `/access` release and layout smoke assertions now verify professional workflow/policy copy instead of tester/interview copy.
- Frontend unit tests cover the market-data outage copy used when Railway returns fallback 404 or network fetch fails.
- Frontend unit tests cover the `Data API down` presentation used by the app-shell data mode pill.
- Follow-up Data Status outage validation passed:
  - `npm --prefix frontend run test -- --run tests/unit/data-health-copy.test.ts tests/unit/data-mode.test.ts tests/unit/data-errors.test.ts` passed: 6 tests.
  - `npm run typecheck` passed.
  - `npm run lint` passed.
  - `npm --prefix frontend run test -- --run` passed: 71 tests.
  - `npm run test:e2e:layout` passed: 16 tests after the Data Status probe was adjusted to skip API health pings in mock mode.
  - Active customer-facing code/template sweep still finds no legacy beta posture copy in `frontend/app`, `frontend/components`, `frontend/lib`, `backend/app`, or `supabase/templates`.
  - Active app scan found no remaining `Beta*` page/component names; only intentional legacy redirect tests reference `/beta`.
- Follow-up Settings access-code validation passed:
  - `npm run typecheck` passed.
  - `npm run lint` passed.
  - `npm --prefix frontend run test -- --run` passed: 72 tests.
  - `npm run test:e2e:layout` passed: 16 tests and now asserts billing does not render `FOUNDER`.
  - `npm audit --audit-level=moderate` passed: 0 vulnerabilities.
  - Active frontend scan found no remaining `FOUNDER100`, `founderCode`, `applyFounderPlan`, or `founder_plan_applied` references.
- Follow-up Professional Access payment API alias validation passed:
  - `backend/.venv/bin/python -m pytest backend/tests/test_payments.py` passed: 18 tests.
  - `backend/.venv/bin/python -m pytest backend/tests/test_payments.py backend/tests/test_broker_order_safety.py backend/tests/test_security_hardening.py` passed: 32 tests.
  - `npm run typecheck` passed.
  - `npm run lint` passed.
  - `npm --prefix frontend run test -- --run` passed: 72 tests.
  - `npm run test:e2e:layout` passed: 16 tests.
  - `npm audit --audit-level=moderate` passed: 0 vulnerabilities.
  - `backend/.venv/bin/python -m pip_audit -r backend/requirements.txt` passed: no known vulnerabilities.
- Follow-up Professional Access invite-plan validation passed:
  - `backend/.venv/bin/python -m pytest backend/tests/test_waitlist_storage.py` passed: 4 tests.
  - `backend/.venv/bin/python -m pytest backend/tests/test_waitlist_storage.py backend/tests/test_payments.py backend/tests/test_security_hardening.py` passed: 25 tests.
  - `npm run typecheck` passed.
  - `npm run lint` passed.
  - `npm --prefix frontend run test -- --run` passed: 72 tests.
  - `npm run test:e2e:layout` passed: 16 tests.
  - `npm audit --audit-level=moderate` passed: 0 vulnerabilities.
  - `backend/.venv/bin/python -m pip_audit -r backend/requirements.txt` passed: no known vulnerabilities.
- Follow-up Professional Access operations cleanup validation:
  - Active forbidden-posture sweep across app/backend/templates/current ops docs found no `private beta`, `founder beta`, `market beta`, `beta access`, `launch surface`, `market command center`, `FOUNDER100`, `founder plan`, or `founder code` matches.
  - Remaining `founder` matches in current ops surfaces are owner/role references, not product positioning.
  - `npm run lint` passed.
  - `npm run typecheck` passed.
  - `npm --prefix frontend run test -- --run` passed: 72 tests.
  - `backend/.venv/bin/python -m pytest backend/tests/test_waitlist_storage.py backend/tests/test_payments.py backend/tests/test_security_hardening.py` passed: 25 tests.
  - `npm audit --audit-level=moderate` passed: 0 vulnerabilities.
  - `backend/.venv/bin/python -m pip_audit -r backend/requirements.txt` passed: no known vulnerabilities.
  - `npm run test:e2e:layout` passed: 16 tests.
  - `PRODUCTION_API_URL=https://alphavyuh-production.up.railway.app npm run check:production-api` still fails with Railway fallback `404 Application not found`, confirming the remaining blocker is Railway deployment/domain recovery.
- Follow-up production data smoke-depth validation:
  - `npm run test:production-api-check` passed with coverage for Railway fallback, stale candles, shallow chart history, healthy deep chart history, and optional authenticated scanner smoke.
  - `PRODUCTION_API_URL=https://alphavyuh-production.up.railway.app npm run check:production-api` still fails at `/health` with Railway fallback `404 Application not found`; deeper checks cannot run until the backend service/domain is restored.
- Follow-up public posture validation:
  - `PUBLIC_SITE_URL=https://www.alphavyuh.com npm run check:public-posture` passed.
  - `npm run check:public-posture` without `PUBLIC_SITE_URL` or `LIVE_URL` skips safely for local runs.
  - `bash -n scripts/launch-readiness-check.sh` passed.
  - `node --check scripts/check-public-posture.mjs` passed.
- Follow-up public posture CI validation:
  - Added `npm run test:public-posture-check` with deterministic local coverage for clean copy, forbidden beta copy, missing Professional Access copy, and legacy `/beta` redirect behavior.
  - Wired `npm run test:public-posture-check` into the Agent PR Gate so every PR protects the public Professional Access posture.

## Production Data Recovery Status

Blocked by Railway authentication/deployment state:

- `railway status --json` fails with `invalid_grant` and `Unauthorized. Please run railway login again.`
- `PRODUCTION_API_URL=https://alphavyuh-production.up.railway.app npm run check:production-api` fails because `/health` returns Railway fallback `404 Application not found`.
- `curl -i https://alphavyuh-production.up.railway.app/health` confirms `x-railway-fallback: true`.
- Rechecked on 2026-05-18 after the Professional Access cleanup; Railway auth and production `/health` remain in the same blocked state.
- Owner-gated tracking issue: [#137 Railway production backend recovery](https://github.com/prasanth-cloud/AlphaVyuh/issues/137).
- A repo search found no committed Railway project ID or backend service ID/name, so the GitHub recovery workflow requires the owner to provide those inputs when running it.
- Supabase production data is present and current; the remaining production outage is Railway hosting/domain recovery.

Next required owner action:

1. Local option: run `railway login` locally for the AlphaVyuh Railway account, then run `npm run recover:railway-backend`.
2. GitHub option: add a `RAILWAY_TOKEN` repository secret, and either add `RAILWAY_PROJECT_ID` / `RAILWAY_SERVICE` / optional `RAILWAY_WORKSPACE` repository secrets or pass those values when running the manual `Railway Backend Recovery` workflow.
3. If the repo is not linked locally, run `cd /Users/PRASAANTH/alphavyuh/backend && railway link`, then rerun `npm run recover:railway-backend`.
4. The helper deploys the backend, waits for `/health`, prints recent Railway logs on failure, and runs `PRODUCTION_API_URL=https://alphavyuh-production.up.railway.app npm run check:production-api`.

## Remaining Risks

- Production market data cannot appear on alphavyuh.com until the Railway backend deployment is restored or the frontend points to a working API host.
- Live broker order placement remains intentionally disabled.
- No Supabase schema changes were made.
