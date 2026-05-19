# Agent PR Gate Recovery Guards - 2026-05-19

## Objective

Keep the Agent PR Gate aligned with the Professional Access cleanup and
production data recovery guardrails that now define launch readiness.

## Agent Report

| Agent | Change | Product impact | Learning | Remaining risk |
|---|---|---|---|---|
| Release Guard Agent | Added the production smoke env, Railway recovery workflow, recovery handoff credential, signed-in copy posture, and Railway secret prep checker tests to Agent PR Gate. | Future PRs must preserve the recovery workflow, credential handoff, signed-in product language, and secret preparation safeguards before merge. | Launch readiness had stricter deterministic coverage than the always-on PR gate. | The gate still proves guardrail shape, not live Railway recovery. |
| QA Agent | Kept the existing production API, public posture, data recovery readiness, release browser smoke, frontend, and backend tests in the same CI job. | The PR gate now covers both the general regression surface and the newer recovery/posture invariants in one place. | The recovery checker tests are lightweight enough to run on every agent PR. | Browser and backend tests can still fail for unrelated regressions and need normal triage. |
| Deploy Agent | Documented that production recovery remains blocked by missing Railway credentials/secrets and the unavailable Railway backend. | Operators can distinguish CI hardening from actual production recovery completion. | The current blocker is owner-gated, not missing local test coverage. | `npm run check:data-recovery` remains expected to fail until Railway is restored. |

## Validation Plan

- `npm run test:production-smoke-env-check`
- `npm run test:railway-recovery-workflow-check`
- `npm run test:recovery-handoff-credentials-check`
- `npm run test:signed-in-copy-posture-check`
- `npm run test:railway-secret-prep`
- `PUBLIC_SITE_URL=https://www.alphavyuh.com npm run check:public-posture`
- `npm run check:data-recovery` is expected to fail on the owner-gated Railway
  blocker until credentials/secrets are restored.

## Current Blocker

Production data recovery is still not complete. The production Railway backend
continues to require owner-provided Railway access and GitHub recovery secrets
before the strict recovery workflow can prove live API and signed-in browser
recovery.
