# Launch Checker Self-Tests

## Goal

Make the launch readiness command verify the checker scripts that now guard
Professional Access copy, production API freshness, Railway recovery readiness,
and recovery secret preparation.

## Agent Report

| Agent | Changed | Why it improves the product | Learned | Remaining risk |
| --- | --- | --- | --- | --- |
| Release Agent | Added the four deterministic checker test scripts to `npm run launch:check`. | Launch readiness now fails early if posture/recovery guard logic regresses before heavier app and browser checks run. | The product had strong standalone guard tests, but the main launch command did not exercise them directly. | Full production recovery is still blocked until Railway serves the backend and authenticated production smoke passes. |
| QA Agent | Updated release readiness docs to describe the checker self-test coverage. | Operators can understand why the launch command catches copy posture and recovery gate drift. | Guardrail tests should be part of release muscle memory, not remembered as separate commands. | Local environments can still skip browser smoke, but checker self-tests remain mandatory. |

## Validation

- `npm run test:production-api-check` passed.
- `npm run test:public-posture-check` passed.
- `npm run test:data-recovery-check` passed.
- `npm run test:railway-secret-prep` passed.
- `bash -n scripts/launch-readiness-check.sh` passed.
- `PUBLIC_SITE_URL=https://www.alphavyuh.com npm run check:public-posture`
  passed.
- `npm run check:data-recovery` failed on the expected Railway blocker:
  production `/health` returns fallback 404 `Application not found`, Railway
  GitHub recovery secrets are missing, and local Railway CLI auth is expired.

## Current Blocker

Railway production backend recovery remains owner-gated. The launch command now
tests the recovery guard logic, but the full launch recovery gate cannot pass
until Railway `/health` serves the FastAPI backend and authenticated production
scanner/watchlist plus signed-in browser evidence is available.
