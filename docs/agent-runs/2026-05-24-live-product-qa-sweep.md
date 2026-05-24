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
| Live public posture | `PUBLIC_SITE_URL=https://www.alphavyuh.com npm run check:public-posture` | Passed. |
| Production API data | `npm run check:production-api:railway` | Passed: summary date `2026-05-22`, breadth `1206/1117`, 500 daily candles each for RELIANCE, ITC, and AUBANK through `2026-05-22`. |
| Production recovery preflight | `npm run check:data-recovery` | Public API recovery passed. Full signed-in recovery remains unproven without authenticated smoke credentials. |
| Local/mock first-run flow | `npm --prefix frontend exec -- playwright test --config=frontend/playwright.mock.config.ts frontend/tests/e2e/workflow-mock.spec.ts -g "signup first-run flow"` | Failed before fix, then passed after onboarding radio selection fix. |
| Local/mock workflow | `npm run test:e2e:mock` | 12 passed after fix. |
| Local/mock layout | `npm run test:e2e:layout` | 16 passed. |
| Local/mock full UI QA | `npm --prefix frontend exec -- playwright test --config=frontend/playwright.mock.config.ts frontend/tests/e2e/full-ui-qa.spec.ts` | 2 passed. |
| TypeScript | `npm --prefix frontend run typecheck` | Passed. |
| Lint | `npm run lint` and `npm --prefix frontend run lint -- app/(app)/onboarding/page.tsx` | Passed. |
| Frontend unit tests | `npm run test` | 43 files, 178 tests passed. |
| Dependency audit | `npm --prefix frontend audit --audit-level=moderate` | Passed after lockfile update. |
| Backend tests | `backend/.venv/bin/python -m pytest backend/tests -q` | Not run in this checkout because `backend/.venv` is missing. |
| GitHub recovery workflow | `gh run list --repo prasanth-cloud/AlphaVyuh --workflow "Railway Backend Recovery" --limit 5` | Latest run `26206595819` succeeded on `2026-05-21T05:04:54Z`. |
| Non-deploy signed-in smoke workflow | `npm run check:production-signed-in-smoke-workflow` and `npm run test:production-signed-in-smoke-workflow-check` | Passed. Added manual GitHub workflow `Production Signed-In Smoke` for authenticated production QA without Railway deploy/recovery. |
| CI workflow runtime guard | `npm run test:ci-action-runtime-check` and `npm run check:ci-action-runtime` | Passed. |

## Fixes

- `frontend/app/(app)/onboarding/page.tsx`
  - Made the custom radio row select its value on row click, not only through the
    nested input `onChange`.
  - This fixed the first-run signup/onboarding flow where `Continue` could stay
    disabled after selecting experience/trade choices.
- `frontend/package-lock.json`
  - Updated transitive `qs` from `6.15.1` to `6.15.2` via `npm --prefix frontend
    audit fix --package-lock-only`, clearing a moderate advisory.

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
