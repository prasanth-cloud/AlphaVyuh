# Full Recovery Evidence Gate

## Goal

Prevent agents and release operators from declaring production recovery complete
when only the public data API smoke passes.

## Agent Report

| Agent | Changed | Why it improves the product | Learned | Remaining risk |
| --- | --- | --- | --- | --- |
| Release Agent | Made `RUN_PRODUCTION_RECOVERY_SMOKE=1` run `check:data-recovery` with `REQUIRE_AUTHENTICATED_SMOKE=1`. | The launch gate now requires authenticated scanner/watchlist API evidence before the signed-in browser smoke can pass. | Public API recovery can be true while the full user workflow remains unverified. | The gate still cannot pass until Railway serves the backend and a production smoke token/login are available. |
| QA/Data Trust Agent | Split recovery messaging into public API status and full app recovery status. | Operators can report partial recovery honestly without overclaiming dashboard, scanner, watchlist, and chart readiness. | The authenticated API smoke is the bridge between raw data recovery and signed-in browser confidence. | Current production remains blocked by Railway fallback 404 until backend recovery is completed. |
| Documentation Agent | Updated release readiness and customer launch runbook language around full recovery evidence. | Future launch checks point to the stricter proof required for paid launch. | Docs needed to distinguish public smoke, authenticated scanner smoke, and browser smoke as separate evidence layers. | Manual QA still needs a real signed-in user after the backend is restored. |

## Validation

- `npm run test:data-recovery-check` passed.
- `bash -n scripts/launch-readiness-check.sh` passed.
- `PUBLIC_SITE_URL=https://www.alphavyuh.com npm run check:public-posture`
  passed.
- `npm run check:data-recovery` failed as expected on the current production
  blocker:
  - Railway production API `/health` returns fallback 404
    `Application not found`.
  - GitHub Railway recovery secrets are missing:
    `RAILWAY_TOKEN`, `RAILWAY_PROJECT_ID`, and `RAILWAY_SERVICE`.
  - Local Railway CLI auth is expired and needs `railway login`.
- `REQUIRE_AUTHENTICATED_SMOKE=1 npm run check:data-recovery` failed on the
  same Railway blocker, confirming the strict gate remains closed.

## Current Blocker

Railway production backend recovery remains the launch blocker until the
production API stops returning Railway fallback 404 and the strict recovery gate
passes with authenticated scanner/watchlist plus signed-in browser evidence.
