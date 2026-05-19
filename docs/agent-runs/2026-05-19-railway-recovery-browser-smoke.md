# Railway Recovery Browser Smoke - 2026-05-19

## Objective

Make the GitHub Railway Backend Recovery path prove full Professional Access
recovery, not just backend API recovery.

## Changes

| Agent | Change | Product impact | Learning | Remaining risk |
|---|---|---|---|---|
| Deploy Agent | Added frontend dependency and Playwright Chromium setup to the manual Railway recovery workflow. | The recovery workflow can run the signed-in browser smoke from GitHub after backend redeploy. | The workflow already required QA credentials, but did not install the browser test runtime that uses them. | Workflow duration is longer because it now installs frontend test dependencies. |
| QA Agent | Added a strict signed-in production browser smoke step after `REQUIRE_AUTHENTICATED_SMOKE=1 npm run check:data-recovery`. | A successful Railway recovery workflow now proves dashboard, scanner, watchlist, full chart, journal, settings, broker, and data pages load against real production data. | Public API recovery and authenticated API smoke are necessary but still not enough for full app recovery. | It still cannot run until owner-provided Railway and production QA credentials exist. |
| Release Guard Agent | Tightened `npm run check:railway-recovery-workflow` and its regression tests to require the browser smoke step and ordering. | Future edits cannot silently remove the final signed-in recovery proof from the workflow. | The guard should assert the proof chain: credentials, deploy, strict data recovery, then browser smoke. | Production backend remains unavailable until Railway is restored. |

## Validation

- `npm run test:railway-recovery-workflow-check`
- `npm run check:railway-recovery-workflow`
- `npm run check:data-recovery` still fails on the expected owner-gated Railway
  blocker: production `/health` returns fallback 404 `Application not found`,
  required Railway GitHub secrets are missing, and local Railway CLI auth is
  expired.

## Blocker

Production data recovery is still not complete. The remaining owner action is to
add `RAILWAY_TOKEN`, `RAILWAY_PROJECT_ID`, `RAILWAY_SERVICE`, and the production
smoke credentials, or refresh local Railway auth, then rerun recovery and the
strict smoke gates.
