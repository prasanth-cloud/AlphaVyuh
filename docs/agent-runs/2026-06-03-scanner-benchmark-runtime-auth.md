# Scanner Benchmark Runtime Auth Fix

## Scope
- Branch/worktree: `codex/scanner-benchmark-runtime-auth` in `/private/tmp/alphavyuh-scanner-benchmark-auth`.
- Fixes the production scanner benchmark `401 Authentication failed` race seen on main run `26859239906`.
- Root cause: production signed-in smoke and scanner benchmark could run in parallel while both updated the same QA smoke user password, invalidating the other workflow's freshly minted bearer token.

## Changes
- Added run-scoped QA smoke email derivation for GitHub Actions via `scripts/production-smoke-account-identity.mjs`.
- Updated `scripts/prepare-production-smoke-account.mjs` to export credentials for the run-scoped QA user.
- Made production scanner benchmark, production signed-in smoke, and Railway backend recovery explicitly use `PLAYWRIGHT_QA_EMAIL_UNIQUE_PER_RUN: "1"`.
- Added scanner benchmark `/api/v1/me` auth preflight so rejected tokens fail as `auth-preflight` before latency timing starts.
- Tightened workflow guard scripts and tests to require the run-scoped smoke identity contract.

## Tests Run
- `npm run test:production-smoke-account-identity`
- `npm run test:scanner-benchmark`
- `npm run test:scanner-benchmark-workflow-check`
- `npm run test:production-smoke-workflow-check`
- `npm run test:railway-recovery-workflow-check`
- `npm run test:production-smoke-env-check`
- `npm run test:production-api-check`
- `npm run test:data-recovery-check`
- `npm run test:ci-action-runtime-check`
- `npm audit --audit-level=moderate`
- `npm --prefix frontend audit --audit-level=moderate`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `python -m pytest backend/tests/test_auth_middleware.py backend/tests/test_route_auth_inventory.py`
- `git diff --check`

## Open Decisions
- Production Supabase cleanup for old QA smoke users remains owner-gated and was not performed.
- The next main-branch proof is rerunning Production Scanner Benchmark after merge.

## Risks
- If Supabase disables plus-addressed emails in the future, the helper can be opted out with `PLAYWRIGHT_QA_EMAIL_UNIQUE_PER_RUN=0`, but parallel workflow auth races may return.

## Next Steps
- Open PR, wait for Agent PR Gate and required checks.
- Merge after checks pass.
- Rerun Production Scanner Benchmark on `main`.
