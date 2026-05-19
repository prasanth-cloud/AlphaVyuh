# Strict Railway Recovery Verification

## Goal

Make the Railway backend recovery workflow prove the same strict production data
recovery evidence that the launch gate requires.

## Agent Report

| Agent | Changed | Why it improves the product | Learned | Remaining risk |
| --- | --- | --- | --- | --- |
| Deploy Agent | Added Vercel CLI installation, smoke credential validation before deploy, and strict `REQUIRE_AUTHENTICATED_SMOKE=1 npm run check:data-recovery` after backend recovery. | A successful Railway workflow now has to prove data recovery after deploy instead of stopping at a narrower backend smoke. | The recovery workflow was stricter about credentials than before, but still lacked the final strict preflight. | It still cannot pass until owner-controlled Railway, Vercel, Supabase, and smoke credentials are available. |
| Data Agent | Taught the recovery preflight to pass `VERCEL_TOKEN` to Vercel CLI when present. | GitHub recovery jobs can inspect production frontend env without relying on an interactive Vercel login. | CI needs token-based Vercel env verification for trustworthy recovery evidence. | The token must exist in GitHub secrets. |
| QA Agent | Added `npm run check:railway-recovery-workflow` and regression tests, then wired both into launch readiness. | Future edits cannot remove strict workflow credential validation or post-recovery preflight silently. | Workflow shape is part of launch safety, not just YAML plumbing. | This checks the recovery workflow structure; live recovery still needs the owner-held credentials. |

## Validation

- `npm run test:railway-recovery-workflow-check`
- `npm run check:railway-recovery-workflow`
- `npm run test:data-recovery-check`
- `npm run test:railway-secret-prep`
- `npm run check:recovery-handoff-credentials`
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
