# Mission Control Recovery Guards Refresh

## Goal

Keep `/agents` aligned with the latest Professional Access cleanup and strict
Railway recovery verification work.

## Agent Report

| Agent | Changed | Why it improves the product | Learned | Remaining risk |
| --- | --- | --- | --- | --- |
| Manager Agent | Refreshed Mission Control lanes and shipped PRs through PR #194. | The operator view now reflects the actual latest recovery hardening instead of stopping at PR #189. | Status surfaces can drift even when executable gates are current. | Mission Control still depends on future updates after each recovery-state change. |
| Deploy Agent | Surfaced the strict Railway recovery workflow, smoke secret prep, and handoff guards in shipped PR history. | The founder can see that recovery now requires strict post-deploy data evidence, not only backend deployment. | The recovery story is now mostly owner-gated rather than under-instrumented. | Railway credentials and local auth are still missing. |
| QA Agent | Updated Mission Control unit expectations for the current #190-#194 recovery guard window. | CI will catch another stale `/agents` recovery window. | The operator page needs tests that encode current recovery proof, not generic PR rows. | It does not prove live recovery; `npm run check:data-recovery` still does that. |

## Validation

- `npm --prefix frontend run test -- --run tests/unit/agent-mission-control.test.ts`
- `npm run check:signed-in-copy-posture`
- `npm run check:railway-recovery-workflow`
- `npm run test`
- `npm run lint`
- `npm run typecheck`
- `PUBLIC_SITE_URL=https://www.alphavyuh.com npm run check:public-posture`
- `npm run check:data-recovery` failed on the expected Railway blocker.

## Current Blocker

Railway production backend recovery remains owner-gated. `npm run
check:data-recovery` still fails because production `/health` returns Railway
fallback 404 `Application not found`, GitHub Railway recovery secrets are
missing, and local Railway CLI auth is expired.
