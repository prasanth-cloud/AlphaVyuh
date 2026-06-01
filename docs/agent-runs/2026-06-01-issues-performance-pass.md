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
- Split scanner data coverage from filtered query size so DB-side narrowing no longer makes healthy scans look degraded or shows misleading low coverage copy.
- Added scanner diagnostics for production evidence: `query_rows`, `source_rows`, `query_row_reduction_pct`, and `db_prefilters_applied`.
- Added `scripts/benchmark-scanner-api.mjs` plus a mocked contract test so post-deploy scanner p50/p95 latency, row reduction, and DB prefilter count can be measured instead of inferred.
- Pushed stock-universe hard rejects into PostgREST too: active status, series, sector, market, and fundamental ranges now reduce rows before Python enrichment.
- Fixed the declared `market_cap_category` scanner filter so it is selected, applied, returned, and DB-prefiltered instead of being silently ignored.
- Extended the scanner benchmark to include a `fundamental-category` scenario so category/fundamental DB pushdown is part of the production proof path.
- Added optional scanner benchmark baseline comparison via `SCANNER_BENCHMARK_BASELINE_JSON` or `SCANNER_BENCHMARK_BASELINE_PATH` and `SCANNER_BENCHMARK_MIN_SPEEDUP`, so the 5-10x target can be enforced with real before/after p50 and p95 latency numbers after deployment.
- Added null-preserving DB prefilters for fallback-computed `volume_ratio`, `w52h_pct`, and `w52l_pct`, reducing row transfer for backfilled scanner rows while keeping DB-null rows available for the existing Python fallback path.
- Added a short-lived active-universe count cache for scanner diagnostics, removing a repeated `stock_universe` count round trip from repeated scans and benchmark samples without changing scan matches.
- Added `SCANNER_BENCHMARK_OUTPUT_JSON` so the authenticated scanner benchmark can save machine-readable baseline and post-deploy p50/p95 evidence without manual copy/paste.
- Added a short-lived scanner-local latest-complete-date cache, avoiding repeated quality-heavy trade-date discovery during repeated scanner runs while preserving explicit `trade_date` bypass for jobs/tests.
- Added server-side scanner phase timings (`date_lookup`, `query`, `filter`, `vcp`, `score`, `sort`, `universe_count`, `total`) to `source_metadata.scanner_performance` and benchmark output so production latency bottlenecks can be measured instead of guessed.
- Tightened `SCANNER_BENCHMARK_MIN_SPEEDUP` enforcement so the broad baseline scenario still reports speedup for context, but only optimized selective scanner scenarios gate the 5-10x target.
- Made speedup enforcement fail closed when any optimized selective scenario is missing baseline p50/p95 evidence, preventing partial benchmark files from proving only part of the 5-10x target.
- Replaced full-result scanner sorting with a plan-capped top-K slice, preserving existing sort/null/tie behavior while avoiding unnecessary sort work when a scan matches more rows than the free/pro response cap.
- Added deterministic equivalence coverage proving the plan-capped top-K slice matches the old full-sort result across varied limits, nulls, ties, ascending, and descending sorts.
- Made scanner setup scoring lazy in the route path: `setup_score` sorts still score all final candidates before ranking, while ordinary sorts score only the visible page returned to the user.
- Added `score` phase timing to scanner diagnostics so production benchmarks can separate row filtering, sorting, and setup-scoring costs.
- Added a no-score execution path for non-UI scanner consumers, then used it for scheduled scan alerts, Telegram `/scan`, and historical backtest counts.
- Reduced scheduled scan alert payload work from "return all matches then slice 50" to "return the first 50 sorted matches while keeping full `total_matches`."
- Fixed historical backtest date selection so a multi-day backtest uses recent unique trade sessions instead of accidentally collapsing to the latest few `daily_ohlcv` rows from one session.

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
- `npm run test:scanner-benchmark` -> passed, including diagnostic-required benchmark, fallback-prefilter diagnostics, server timing output, JSON output, selective-scenario speedup-baseline contract coverage, and missing-baseline failure coverage.
- `npm run check:sector-taxonomy:railway` -> passed structurally; reports taxonomy unverified and industry taxonomy not audited.
- `npm run test:setup-review-check` -> passed.
- `npm run test:broker-readonly-check` -> passed.
- `uv run --with pytest --with-requirements backend/requirements.txt python -m pytest backend/tests/test_scanner_filters.py backend/tests/test_scanner_outage_status.py` -> targeted scanner tests passed, including lazy setup-scoring coverage.
- `uv run --with pytest --with-requirements backend/requirements.txt python -m pytest backend/tests/test_scanner_outage_status.py backend/tests/test_scan_alerts.py` -> targeted scanner/alerts tests passed, including no-score background execution coverage.
- `uv run --with pytest --with-requirements backend/requirements.txt python -m pytest backend/tests/test_backtest.py backend/tests/test_scanner_outage_status.py backend/tests/test_scan_alerts.py` -> targeted backtest/scanner/alerts tests passed, including unique backtest date coverage.
- `uv run --with pytest --with-requirements backend/requirements.txt python -m pytest backend/tests` -> 323 passed.
- `npm run test:sector-taxonomy-check` -> passed.
- `npm run test:market-data-entitlement-check` -> passed.
- `npm --prefix frontend run typecheck` -> passed.
- `npm run lint` -> passed.
- `npm run test:e2e:perf` -> 2 passed.
- `git diff --check` -> passed.

## Open Risks

- The scanner optimization should be benchmarked against production authenticated scanner once the PR is deployed by running `PRODUCTION_API_URL=<backend> PRODUCTION_API_BEARER_TOKEN=<token> npm run check:scanner-benchmark`.
- To prove the 5-10x target, first record baseline p50/p95 latencies from the currently deployed scanner with `SCANNER_BENCHMARK_OUTPUT_JSON=/tmp/scanner-baseline.json npm run check:scanner-benchmark`, then rerun after deployment with `SCANNER_BENCHMARK_BASELINE_PATH=/tmp/scanner-baseline.json SCANNER_BENCHMARK_MIN_SPEEDUP=5 npm run check:scanner-benchmark`. Use `SCANNER_BENCHMARK_MIN_SPEEDUP=10` only if the owner wants to enforce the upper target.
- The target 5-10x improvement is plausible for selective presets due reduced row transfer, but not proven end-to-end until the deployed authenticated benchmark records passing before/after speedup ratios. The benchmark still reports the broad baseline scenario, but the hard speedup threshold is intentionally enforced on optimized selective scenarios only.
- Do not mutate production Supabase, run broker credentials, enable billing, or change TradingView implementation posture without explicit owner approval.

## Next Steps

- Keep PR #331 green and merge/deploy only after explicit owner approval.
- Close #282 if owner accepts the current setup-review evidence as complete.
- Keep #284, #285, #287, #63, and #42 open with precise remaining gates instead of overclaiming.
