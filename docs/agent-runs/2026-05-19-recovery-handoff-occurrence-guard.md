# Recovery Handoff Occurrence Guard

## Goal

Make every active production recovery command stand on its own with the exact
credential names required for strict post-Railway recovery evidence.

## Agent Report

| Agent | Changed | Why it improves the product | Learned | Remaining risk |
| --- | --- | --- | --- | --- |
| QA Agent | Tightened `npm run check:recovery-handoff-credentials` to validate each `RUN_PRODUCTION_RECOVERY_SMOKE=1` occurrence, not just each file. | A later stale recovery command can no longer pass because another paragraph mentions the right env vars. | File-level docs checks were too coarse for repeated runbook snippets. | Historical archived docs are still intentionally outside this active guard. |
| Release Agent | Replaced vague QA-login wording with exact `PLAYWRIGHT_QA_EMAIL` and `PLAYWRIGHT_QA_PASSWORD` names in active release snippets. | The next recovery owner gets copy-pasteable, complete instructions for the strict gate. | `PLAYWRIGHT_QA_EMAIL/PASSWORD` is too ambiguous for an executable handoff. | Real values still need to come from owner-controlled production credentials. |
| Deploy Agent | Added the required production smoke credential exports to the local Railway recovery path. | Local recovery and GitHub workflow recovery now both end with the same full evidence requirements. | A restored backend URL is still only partial recovery without signed-in proof. | Railway backend recovery remains blocked by missing secrets or refreshed CLI auth. |

## Validation

- `npm run test:recovery-handoff-credentials-check`
- `npm run check:recovery-handoff-credentials`
- `npm run check:signed-in-copy-posture`
- `npm run test`
- `npm run lint`
- `npm run typecheck`
- `PUBLIC_SITE_URL=https://www.alphavyuh.com npm run check:public-posture`
- `bash -n scripts/launch-readiness-check.sh`
- `npm run check:data-recovery` failed on the expected Railway blocker.

## Current Blocker

Railway production backend recovery remains owner-gated. `npm run
check:data-recovery` still fails because production `/health` returns Railway
fallback 404 `Application not found`, GitHub Railway recovery secrets are
missing, and local Railway CLI auth is expired.
