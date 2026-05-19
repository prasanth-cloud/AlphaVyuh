# Recovery Smoke Secret Prep

## Goal

Make the Railway recovery automation carry the same production smoke credential
requirements as the strict recovery gate.

## Agent Report

| Agent | Changed | Why it improves the product | Learned | Remaining risk |
| --- | --- | --- | --- | --- |
| Deploy Agent | Added `PLAYWRIGHT_QA_EMAIL` and `PLAYWRIGHT_QA_PASSWORD` to Railway recovery secret preparation and the GitHub recovery workflow environment. | The GitHub recovery path can now prepare the signed-in production smoke credentials needed for full recovery. | The workflow had the API smoke token path, but not the QA login pair required by PR #189. | Owner still has to provide the real Railway and QA credential values. |
| QA Agent | Added regression coverage so `prepare:railway-recovery-secrets` sets API and QA smoke secrets when provided. | Secret-prep drift is now caught before a recovery attempt reaches CI. | Recovery automation needs tests for evidence credentials, not only deploy credentials. | The workflow validates smoke env names but still cannot run signed-in browser smoke until Railway and QA credentials exist. |
| Data Agent | Updated recovery preflight messaging to separate required Railway secrets from recovery smoke secrets. | Operators can distinguish "backend deploy path missing" from "full recovery evidence credentials missing." | Calling smoke credentials optional made the recovery state easier to misread. | Current live preflight still fails before smoke-secret reporting because required Railway secrets are absent. |

## Validation

- `npm run test:railway-secret-prep`
- `npm run test:data-recovery-check`
- `npm run test:production-smoke-env-check`
- `npm run check:recovery-handoff-credentials`
- `npm run lint`
- `npm run typecheck`
- `PUBLIC_SITE_URL=https://www.alphavyuh.com npm run check:public-posture`
- `bash -n scripts/launch-readiness-check.sh`
- `npm run check:production-smoke-env` failed as expected without
  `PRODUCTION_API_BEARER_TOKEN`, `PLAYWRIGHT_QA_EMAIL`, and
  `PLAYWRIGHT_QA_PASSWORD`.
- `npm run check:data-recovery` failed on the expected Railway blocker.

## Current Blocker

Railway production backend recovery remains owner-gated. `npm run
check:data-recovery` still fails because production `/health` returns Railway
fallback 404 `Application not found`, GitHub Railway recovery secrets are
missing, and local Railway CLI auth is expired.
