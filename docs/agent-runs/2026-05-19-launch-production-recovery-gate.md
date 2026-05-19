# Launch Production Recovery Gate

## Goal

Wire the production data recovery and signed-in production browser smoke into the
top-level launch readiness command behind an explicit release flag.

## Agent Report

| Agent | Changed | Why it improves the product | Learned | Remaining risk |
| --- | --- | --- | --- | --- |
| Release Agent | Added `RUN_PRODUCTION_RECOVERY_SMOKE=1` support to `npm run launch:check`. | After Railway recovery, one launch command can run the production data recovery preflight and signed-in production browser smoke. | The required checks existed, but the top-level launch gate did not orchestrate them. | The flag cannot pass until Railway serves the backend and a production QA login is valid. |
| QA Agent | Updated release docs and customer launch runbook to include the new flag. | Operators have the same recovery command path in code and docs. | Launch checklists drift unless the runnable script and docs change together. | Real-data browser evidence is still blocked by Railway. |

## Validation

- `bash -n scripts/launch-readiness-check.sh` passed.
- `npm run check:data-recovery` remains expected to fail on Railway recovery:
  - Production API data smoke fails because Railway returns fallback 404
    `Application not found`.
  - GitHub recovery secrets are still missing:
    `RAILWAY_TOKEN`, `RAILWAY_PROJECT_ID`, and `RAILWAY_SERVICE`.
  - Vercel production env, Supabase EOD data, and chart smoke config pass.

## Current Blocker

Run:

```bash
npm run recover:railway-backend:login
```

Then complete Railway activation and rerun:

```bash
npm run check:data-recovery
RUN_PRODUCTION_RECOVERY_SMOKE=1 LIVE_URL=https://www.alphavyuh.com npm run launch:check
```
