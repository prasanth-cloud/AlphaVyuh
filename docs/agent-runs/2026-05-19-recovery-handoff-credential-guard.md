# Recovery Handoff Credential Guard

## Goal

Prevent active recovery handoffs from documenting the strict production recovery
gate without the production API token and signed-in QA credential requirements.

## Agent Report

| Agent | Changed | Why it improves the product | Learned | Remaining risk |
| --- | --- | --- | --- | --- |
| Manager Agent | Updated active agent handoffs to show the full post-Railway recovery credential set. | The next recovery owner can run the strict gate without rediscovering missing QA env values. | Some active docs still had the older API-token-only snippet after PR #189. | Historical reports still preserve old context and are not launch instructions. |
| Deploy Agent | Updated environment recovery docs so GitHub and local Railway paths end with the full production recovery gate. | Backend recovery and signed-in production proof now stay linked in the same runbook section. | A restored `/health` is not enough; the signed-in workflow must also prove real data. | Railway credentials and local auth remain owner-controlled. |
| QA Agent | Added `npm run check:recovery-handoff-credentials` and regression tests, then wired both into launch readiness. | Launch checks now fail if active recovery docs drift back to incomplete credential instructions. | Documentation can regress even when executable smoke gates are strict. | The guard checks active handoff files, not archived historical launch notes. |

## Validation

- `npm run test:recovery-handoff-credentials-check`
- `npm run check:recovery-handoff-credentials`
- `npm run test:signed-in-copy-posture-check`
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
