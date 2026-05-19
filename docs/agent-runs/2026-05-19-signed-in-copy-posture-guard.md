# Signed-In Copy Posture Guard

## Goal

Keep the authenticated operator surfaces aligned with Professional Access copy
after the public pages are already clean.

## Agent Report

| Agent | Changed | Why it improves the product | Learned | Remaining risk |
| --- | --- | --- | --- | --- |
| Manager Agent | Refreshed Mission Control with PRs #187-#189 and the current Railway blocker. | `/agents` now tells the latest recovery story instead of stopping at PR #186. | Operator status can become stale even when public copy is clean. | It still depends on owners to restore Railway credentials and auth. |
| Product Copy Agent | Removed remaining visible/operator `workspace` framing from Mission Control and the internal style guide. | Signed-in guidance now reinforces trading desk, chart surface, and recovery language. | Copy drift can hide in operator-only surfaces. | Technical class names and API route names still use workspace where they model saved chart state. |
| QA Agent | Added `npm run check:signed-in-copy-posture` and regression tests, then wired both into launch readiness. | Future launch batches get a deterministic guard for stale signed-in copy posture. | Public posture checks do not prove authenticated/operator copy stays aligned. | The guard intentionally targets visible/operator copy, not internal chart-workspace identifiers. |

## Validation

- `npm run test:signed-in-copy-posture-check`
- `npm run check:signed-in-copy-posture`
- `npm run test:public-posture-check`
- `PUBLIC_SITE_URL=https://www.alphavyuh.com npm run check:public-posture`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `bash -n scripts/launch-readiness-check.sh`

## Current Blocker

Railway production backend recovery remains owner-gated. `npm run
check:data-recovery` still fails because production `/health` returns Railway
fallback 404 `Application not found`, GitHub Railway recovery secrets are
missing, and local Railway CLI auth is expired.
