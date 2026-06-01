# Issues Latency Trust Pass

## Scope

- Branch/worktree: `codex/issues-latency-trust-pass` at `/private/tmp/alphavyuh-issues-performance`.
- User goal: resolve issue-driven trust/performance problems quickly, learn from the mistakes, and keep AlphaVyuh fast with very low latency.

## Done

- Rechecked open issues after PR #335 deployment and benchmark evidence.
- Identified a live recovery-check trust bug tied to issue #284: `ingest_runs` is a shared operational table, so the newest row can be a market-breadth snapshot rather than the latest Daily NSE supplemental refresh.
- Updated `scripts/check-data-recovery-readiness.mjs` to scan the latest 20 ingest runs and use the newest row that actually contains `meta.supplemental_data`.
- Kept the warning behavior honest: if no recent run includes supplemental metadata, the checker now says that directly instead of blaming only the single latest ingest run.
- Added regression coverage for a newer non-supplemental snapshot row followed by a healthy supplemental refresh row.
- Added regression coverage for the true missing-metadata case.
- Fixed production-like auth middleware behavior so missing Supabase auth env redirects protected routes to login instead of throwing in middleware.
- Updated onboarding and chart workflow smoke tests to match current cash-equity scope and avoid ambiguous R:R assertions.
- Updated the live backend smoke to accept only real success or controlled unavailable responses in fake-Supabase/mock-provider mode.
- Fixed the launch checker frontend unit-test command so backend virtualenv setup cannot make Vitest crawl the wrong workspace.

## Learned

- Data trust checks should be provenance-aware when several jobs write to the same operational table.
- "Latest row" assumptions create false launch warnings and slow recovery because they confuse snapshot writers with refresh writers.
- Auth boundaries should fail closed even when env setup is incomplete; a missing Supabase URL/key must not strand traders on a broken app route.
- Test commands must pin their working directory, because adding backend tooling can otherwise make frontend test discovery unexpectedly slow.
- The production scanner performance evidence from PR #335 is strong, but launch readiness still needs authenticated app smoke and owner-gated broker/vendor/legal gates before making broad launch claims.

## Verification

- `npm run test:data-recovery-check` -> passed.
- `npm run check:data-recovery` -> passed public production API smoke against `https://alphavyuh-production.up.railway.app`; warnings remain for local Vercel link, local Supabase env, missing production bearer token, and local Railway project link.
- `npm --prefix frontend run test -- proxy-public-routes.test.ts` -> passed, 4 tests.
- `npm --prefix frontend exec -- playwright test --config=frontend/playwright.release.config.ts frontend/tests/e2e/release-readiness.spec.ts` -> passed, 7 tests.
- `npm --prefix frontend exec -- playwright test --config=frontend/playwright.mock.config.ts frontend/tests/e2e/workflow-mock.spec.ts -g "signup first-run|position drawing"` -> passed, 2 tests.
- `npm run test:e2e:backend` -> passed, 4 tests.
- `npm test` -> passed, 60 frontend unit files and 274 tests.
- `npm run launch:check` -> passed through launch checkers, frontend lint/typecheck/unit/build/audit, browser smoke, live backend smoke, and 329 backend tests. Backend dependency audit was skipped because `pip-audit` is not installed in the local backend venv.

## Remaining Risks

- Supplemental metadata could not be verified from raw Supabase in this local checkout because `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` were not available.
- Authenticated production scanner/watchlist and signed-in production browser smoke still require a production bearer token and QA credentials.
- Issue #287 still needs owner-approved real broker read-only smoke before any broker confidence claim.
- Issues #42 and #63 remain owner/vendor/legal launch gates.

## Next Steps

- Open a focused PR for the recovery-check fix and keep it separate from broader UX/performance work.
- After merge, rerun the Railway recovery/readiness check from a configured environment with Supabase env vars to verify supplemental refresh metadata without false warnings.
- Continue performance work by measuring the slowest production surfaces under authenticated smoke: scanner, watchlist review queue, chart load, and dashboard market pulse.
