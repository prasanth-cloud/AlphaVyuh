# Live Product QA Sweep

Date: 2026-05-24

## Goal

Verify live `alphavyuh.com` and local signed-in workflows for user-facing
errors, data trust, and product friction. Fix reproducible issues and keep the
remaining production evidence gap explicit.

## Coverage

| Surface | Evidence | Result |
| --- | --- | --- |
| Live public site | In-app browser opened `/` and `/login`; screenshots saved under `docs/screenshots/live-qa-2026-05-24/`. | Passed with no browser console errors observed. |
| Live auth boundary | `PLAYWRIGHT_BASE_URL=https://www.alphavyuh.com npm --prefix frontend exec -- playwright test --config=playwright.local.config.ts tests/e2e/release-readiness.spec.ts --workers=1` | 7 passed. |
| Live public posture | `PUBLIC_SITE_URL=https://www.alphavyuh.com npm run check:public-posture` | Previously passed. On the later 2026-05-24 rerun, deterministic HTTP verification was blocked by Cloudflare `cf-mitigated: challenge`; Chrome loaded `/` and `/login` normally. |
| Live public/auth Playwright rerun | `PLAYWRIGHT_BASE_URL=https://www.alphavyuh.com npm --prefix frontend exec -- playwright test --config=frontend/playwright.local.config.ts frontend/tests/e2e/release-readiness.spec.ts --workers=1` | 5 passed, 2 failed because Cloudflare challenge responses replaced app responses during header/auth-boundary assertions. Treat as production automation blocked, not signed-in product verification. |
| Production API data | `npm run check:production-api:railway` | Passed: summary date `2026-05-22`, breadth `1206/1117`, 500 daily candles each for RELIANCE, ITC, and AUBANK through `2026-05-22`. |
| Production recovery preflight | `npm run check:data-recovery` | Public API recovery passed. Full signed-in recovery remains unproven without authenticated smoke credentials. |
| Local/mock first-run flow | `npm --prefix frontend exec -- playwright test --config=frontend/playwright.mock.config.ts frontend/tests/e2e/workflow-mock.spec.ts -g "signup first-run flow"` | Failed before fix, then passed after hardening onboarding radio selection for row click, input click, and direct checked-state automation. |
| Local/mock workflow | `npm run test:e2e:mock` | 12 passed after fix. |
| Local/mock layout | `npm run test:e2e:layout` | 16 passed. |
| Local/mock signed-in smoke | `npm run test:e2e:smoke` | 1 passed. |
| Local/mock performance smoke | `npm run test:e2e:perf` | 2 passed. |
| Local/mock failure-path focus | `npm --prefix frontend exec -- playwright test --config=frontend/playwright.mock.config.ts frontend/tests/e2e/auth.spec.ts frontend/tests/e2e/broker-connect.spec.ts frontend/tests/e2e/dashboard-unavailable.spec.ts frontend/tests/e2e/fundamentals-unavailable.spec.ts --workers=1` | 20 passed, 7 skipped after refreshing mock-auth, read-only broker, and outage route-mock expectations. |
| Local/mock failure-path bundle | `npm --prefix frontend exec -- playwright test --config=frontend/playwright.mock.config.ts frontend/tests/e2e/auth.spec.ts frontend/tests/e2e/broker-callback.spec.ts frontend/tests/e2e/broker-connect.spec.ts frontend/tests/e2e/chart-drawings.spec.ts frontend/tests/e2e/chart-unavailable.spec.ts frontend/tests/e2e/chart-watchlists-unavailable.spec.ts frontend/tests/e2e/dashboard-unavailable.spec.ts frontend/tests/e2e/fundamentals-unavailable.spec.ts frontend/tests/e2e/journal.spec.ts frontend/tests/e2e/onboarding-mutation-failures.spec.ts frontend/tests/e2e/portfolio-unavailable.spec.ts frontend/tests/e2e/scan-alerts-unavailable.spec.ts frontend/tests/e2e/scanner-unavailable.spec.ts frontend/tests/e2e/watchlist-broker-status-failures.spec.ts frontend/tests/e2e/watchlist-mutation-failures.spec.ts frontend/tests/e2e/watchlist-workspace-failures.spec.ts --workers=1` | 57 passed, 17 skipped. Earlier run exposed stale spec/config assumptions rather than new product regressions. |
| Release readiness smoke | `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key SUPABASE_URL=https://example.supabase.co SUPABASE_SERVICE_ROLE_KEY=test-service-role-key npm run test:e2e:release` | 7 passed. |
| Backend live smoke | `PLAYWRIGHT_BACKEND_UVICORN=/tmp/alphavyuh-backend-ci-venv/bin/uvicorn npm run test:e2e:backend` | 4 passed after smoke accepted controlled `503` unavailable payloads for placeholder-Supabase DB-backed paths. |
| Local/mock full UI QA | `npm --prefix frontend exec -- playwright test --config=frontend/playwright.mock.config.ts frontend/tests/e2e/full-ui-qa.spec.ts --workers=1` | 4 passed after adding marker-level coverage for alerts, portfolio, options, community, upload, agents, data, settings, billing, and broker settings plus an options payoff calculation workflow. |
| TypeScript | `npm --prefix frontend run typecheck` | Passed. |
| Lint | `npm --prefix frontend run lint` and `npm --prefix frontend run lint -- app/(app)/onboarding/page.tsx` | Passed. |
| Frontend unit tests | `npm run test` | 43 files, 178 tests passed. |
| Dependency audit | `npm --prefix frontend audit --audit-level=moderate` | Passed after lockfile update. |
| Backend tests | `/tmp/alphavyuh-backend-ci-venv/bin/python -m pytest backend/tests` | 285 passed, 6 warnings. |
| Backend dependency audit | `/tmp/alphavyuh-backend-ci-venv/bin/python -m pip_audit -r backend/requirements.txt --disable-pip --no-deps --progress-spinner off` | No known vulnerabilities found. |
| GitHub recovery workflow | `gh run list --repo prasanth-cloud/AlphaVyuh --workflow "Railway Backend Recovery" --limit 5` | Latest run `26206595819` succeeded on `2026-05-21T05:04:54Z`. |
| Non-deploy signed-in smoke workflow | `npm run check:production-signed-in-smoke-workflow` and `npm run test:production-signed-in-smoke-workflow-check` | Passed. Added manual GitHub workflow `Production Signed-In Smoke` for authenticated production QA without Railway deploy/recovery. |
| CI workflow runtime guard | `npm run test:ci-action-runtime-check` and `npm run check:ci-action-runtime` | Passed. |

## Fixes

- `frontend/app/(app)/onboarding/page.tsx`
  - Made the custom radio row select its value on row mouse down, input click,
    and direct checked-state changes.
  - This fixed the first-run signup/onboarding flow where `Continue` could stay
    disabled after selecting experience/trade choices.
- `frontend/playwright.backend.config.ts`
  - Added `PLAYWRIGHT_BACKEND_UVICORN` so backend smoke can run from a temporary
    or CI-managed Python environment instead of requiring `backend/.venv`.
- `frontend/tests/e2e/backend-live-smoke.spec.ts`
  - Kept HTTP smoke strict about crashes while accepting controlled
    `503 temporarily unavailable` payloads for DB-backed routes when the smoke
    server is intentionally using placeholder Supabase credentials.
- `frontend/playwright.mock.config.ts`
  - Propagated `PLAYWRIGHT_MOCK_AUTH=true` into the Playwright test process so
    mock-auth skips and expectations match the mock server environment.
- `frontend/tests/e2e/auth.spec.ts`
  - Skipped unauthenticated app-route redirect assertions under mock auth and
    replaced the stale `/charts/* -> /watchlist` legacy expectation with the
    current protected chart-route boundary.
- `frontend/tests/e2e/broker-connect.spec.ts`
  - Reworked broker settings coverage around the current read-only import hub:
    `/api/v1/broker/status`, Zerodha login URL generation, outage copy,
    connected read-only status, and import controls.
- `frontend/tests/e2e/dashboard-unavailable.spec.ts` and
  `frontend/tests/e2e/fundamentals-unavailable.spec.ts`
  - Enabled route-backed mocks so outage assertions exercise unavailable API
    payloads instead of the client demo fallback.
- `frontend/tests/e2e/full-ui-qa.spec.ts`
  - Added secondary signed-in feature markers so the mock UI gate verifies more
    than navigation for alerts, portfolio, options, community, upload, agents,
    data status, settings, billing, and broker settings.
  - Added options strategy builder coverage that fills spot, strike, and premium
    values, calculates payoff, and verifies P&L and Greeks output.
- `frontend/package-lock.json`
  - Updated transitive `qs` from `6.15.1` to `6.15.2` via `npm --prefix frontend
    audit fix --package-lock-only`, clearing a moderate advisory.
- `scripts/check-public-posture.mjs`
  - Added explicit Cloudflare challenge detection so a bot-mitigation page is
    reported as a QA-environment blocker instead of a generic `403`.
  - Covered with `scripts/test-check-public-posture.mjs`.

## Current Blocker

Full live signed-in product verification still needs a production QA session.
This shell does not have:

- `PLAYWRIGHT_QA_EMAIL`
- `PLAYWRIGHT_QA_PASSWORD`
- `PLAYWRIGHT_SUPABASE_AUTH_COOKIES`
- `PRODUCTION_API_BEARER_TOKEN`

Until those are available, do not claim production dashboard, scanner,
watchlist, chart, journal, upload, settings, broker, and data flows are fully
verified. The available evidence proves public production and local/mock
signed-in behavior, not authenticated production behavior.

The current Cloudflare managed challenge can also block deterministic public
HTTP/Playwright checks from this environment. Real Chrome access still rendered
the landing and login pages, but production automation needs an allowed QA
environment or Cloudflare rule adjustment before it can be treated as complete
evidence.

GitHub repository secrets for the signed-in smoke exist, and the latest
`Railway Backend Recovery` workflow succeeded. A safer manual workflow,
`Production Signed-In Smoke`, now exists for signed-in production verification
without deploying or recovering Railway. Run that workflow from GitHub Actions
when full live signed-in coverage is needed.

## Product Notes

- C++ should not be used for a full AlphaVyuh rewrite. The current product
  bottleneck is data trust and workflow quality, not microsecond execution.
- C++ is a future option for isolated services only: bulk indicator/backtest
  computation, tick ingestion, or low-latency order routing after measured
  latency/data-volume pressure exists.
- See `docs/decisions/015-latency-language-boundary.md`.
