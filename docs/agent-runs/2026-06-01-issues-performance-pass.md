# Issues Performance Pass

## Scope

- Active goal: resolve open issues where engineering can move them forward and improve AlphaVyuh performance.
- Branch/worktree: `codex/issues-performance-pass` at `/private/tmp/alphavyuh-issues-performance`.

## Done

- Audited current open GitHub issues and recent PR state.
- Verified production API recovery remains healthy against Railway.
- Verified production sector taxonomy contract now exists and returns structured audit metadata.
- Optimized scanner query construction by pushing non-fallback intelligence filters into PostgREST before Python enrichment.
- Added unit coverage proving fallback-computed filters remain Python-side so older/partial data behavior is preserved.
- Extended the production API checker to report authenticated scanner latency and source-row count, creating a deploy-time evidence path for the 5-10x performance target.

## Why

Scanner launch presets such as Trend Template and Box Breakout were still fetching broader daily OHLCV row sets and rejecting many candidates in Python. Moving hard-reject intelligence filters into the database reduces network payload and Python scoring work while keeping data-trust fallback semantics intact.

## Learned

- Several open issues are stale from a PR bookkeeping perspective, but not all can be closed safely.
- #282 setup-review implementation appears landed and is covered by the named setup-review gate.
- #285 production sector taxonomy contract passes structurally, but the contract correctly reports taxonomy `unverified` and industry taxonomy `not_audited`.
- #284 still needs production supplemental refresh metadata proof.
- #287 still needs owner-approved real broker read-only smoke before any broker execution confidence claim.
- #42 and #63 remain true owner/vendor/legal gates.

## Verification

- `npm run check:production-api:railway` -> passed public API data smoke; authenticated scanner skipped without local bearer token.
- `npm run test:production-api-check` -> passed, including authenticated scanner latency/source-row output coverage.
- `npm run check:sector-taxonomy:railway` -> passed structurally; reports taxonomy unverified and industry taxonomy not audited.
- `npm run test:setup-review-check` -> passed.
- `npm run test:broker-readonly-check` -> passed.
- `uv run --with pytest --with-requirements backend/requirements.txt python -m pytest backend/tests/test_scanner_filters.py backend/tests/test_scanner_outage_status.py` -> 51 passed.
- `uv run --with pytest --with-requirements backend/requirements.txt python -m pytest backend/tests` -> 309 passed.
- `npm run test:sector-taxonomy-check` -> passed.
- `npm run test:market-data-entitlement-check` -> passed.
- `npm --prefix frontend run typecheck` -> passed.
- `npm run lint` -> passed.
- `npm run test:e2e:perf` -> 2 passed.
- `git diff --check` -> passed.

## Open Risks

- The scanner optimization should be benchmarked against production authenticated scanner once the PR is deployed because local checks prove query shape and regression safety, not live p50/p95.
- The target 5-10x improvement is plausible for selective presets due reduced row transfer, but not proven end-to-end until a deployed authenticated scanner benchmark records before/after rows and latency.
- Do not mutate production Supabase, run broker credentials, enable billing, or change TradingView implementation posture without explicit owner approval.

## Next Steps

- Open PR for the scanner prefilter optimization.
- Close #282 if owner accepts the current setup-review evidence as complete.
- Keep #284, #285, #287, #63, and #42 open with precise remaining gates instead of overclaiming.
