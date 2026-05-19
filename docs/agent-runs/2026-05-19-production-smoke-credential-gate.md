# Production Smoke Credential Gate

## Goal

Require explicit production smoke credentials before running the signed-in
production browser smoke, and remove baked-in QA credential values from
Playwright signed-in smoke files.

## Agent Report

| Agent | Changed | Why it improves the product | Learned | Remaining risk |
| --- | --- | --- | --- | --- |
| QA Agent | Added a shared Playwright QA credential helper with mock-only defaults and strict production-smoke enforcement. | Production browser evidence now requires an explicit QA login instead of silently trying stale checked-in values. | Mock login can use harmless local defaults, but production proof needs deliberate credentials. | The real production smoke still cannot pass until Railway is restored and QA credentials are provided. |
| Release Agent | Added `npm run check:production-smoke-env` and wired it into `RUN_PRODUCTION_RECOVERY_SMOKE=1 npm run launch:check`. | The full recovery gate now fails early if the production API smoke token or signed-in QA credentials are missing. | Credential readiness is part of recovery evidence, not a browser-test afterthought. | The required values must be supplied by the owner or secure CI environment. |
| Security Agent | Removed the real-looking default QA email/password from signed-in Playwright specs. | Test code no longer carries production-like login material. | Defaults should be clearly mock-only when they exist at all. | Other historical docs may mention credentials as examples, but active smoke specs no longer do. |

## Validation

- `npm run test:production-smoke-env-check` passed.
- `npm run test:public-posture-check` passed.
- `npm run lint` passed.
- `bash -n scripts/launch-readiness-check.sh` passed.
- `npm run test:e2e:smoke` passed.
- `PUBLIC_SITE_URL=https://www.alphavyuh.com npm run check:public-posture`
  passed.
- `npm run check:data-recovery` failed on the expected Railway blocker:
  production `/health` returns fallback 404 `Application not found`, Railway
  GitHub recovery secrets are missing, and local Railway CLI auth is expired.

## Current Blocker

Railway production backend recovery remains owner-gated. This PR strengthens the
credential gate for post-recovery browser proof, but full completion still
requires Railway `/health` to serve the FastAPI backend and the strict recovery
gate to pass with real smoke credentials.
