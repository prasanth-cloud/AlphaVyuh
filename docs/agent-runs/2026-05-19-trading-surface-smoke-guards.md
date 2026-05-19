# Trading Surface Smoke Guards - 2026-05-19

## Objective

Move the platform-quality goal forward by making dashboard, scanner, watchlist,
chart, and data-status reliability part of the regular agent gate.

## Agent Report

| Agent | Change | Product impact | Learning | Remaining risk |
|---|---|---|---|---|
| QA Agent | Added signed-in workflow browser smoke to Agent PR Gate and launch readiness. | Every agent PR now has to load dashboard, scanner, watchlist, chart, journal, settings, broker, and data status in an authenticated workflow. | Public/auth smoke was not enough to protect the trader workbench. | CI still uses mock auth/data unless production smoke env is explicitly enabled. |
| Data Trust Agent | Added stable dashboard and scanner data-trust hooks, then tightened real-data smoke assertions for freshness/source/coverage context. | Post-Railway production smoke must prove trader surfaces show data context and avoid demo/mock copy. | Real-data proof needs page-level evidence, not only API JSON checks. | Live proof remains blocked until Railway and QA credentials are restored. |
| Release Agent | Kept the strict recovery path separate: production signed-in smoke still requires `RUN_PRODUCTION_RECOVERY_SMOKE=1` after Railway recovery. | The normal PR gate catches workflow regressions without pretending production data is recovered. | Recovery completion must remain owner-gated until API hosting is actually restored. | `npm run check:data-recovery` is still expected to fail before Railway recovery. |

## Validation Plan

- `npm run test:e2e:smoke`
- `npm run test:e2e:release`
- `npm run typecheck`
- `npm run test:data-recovery-check`
- `npm run check:data-recovery` remains expected to fail until Railway recovery.

## Current Blocker

Production data recovery is still incomplete. Supabase EOD data is present, but
the Railway backend and GitHub recovery secrets are still required before the
strict production signed-in smoke can prove live dashboard, scanner, watchlist,
chart, and data-status recovery.
