# ADR 005 — Scan Engine Architecture

> Status: **AMENDED** (originally ACCEPTED; amended after M3-C benchmark)
>
> Original decision: option (b) Python worker with two-pass VCP.
> Amendment: VCP pass 2 now uses a Postgres CTE (hybrid architecture).
> See §Amendment — Hybrid Architecture and §Revisit Triggers for the change log.
>
> Supersedes: the clause in `docs/scan-dsl.md §Execution` that read "The scan compiler
> turns a `ScanDefinition` into a single parameterized SQL query — no row-by-row evaluation
> in the app layer." That clause described a future intent, not an implemented state. This ADR
> makes the actual architecture explicit. See §Migration cost if we pick wrong for what
> switching to that model later would require.

---

## Context

alphavyuh needs a scanner that lets users run SEPA / VCP / custom setups across the NSE/BSE
universe on-demand and on a daily schedule after market close.

**Constraints that shape the choice:**

| Constraint | Value |
|---|---|
| On-demand latency budget | < 2 s for Nifty 500; < 5 s for all-NSE (~2,000 active symbols) |
| Scheduled trigger | Daily at ~16:15 IST, after bhavcopy ingest completes |
| Indicator precomputation | All single-day indicators already in `daily_ohlcv`: EMA 20/50/200, ATR, RSI, volume_ratio, pct_change, 52w high/low, MACD, RS rating |
| Existing implementation | `backend/app/routers/scanner.py` — option (b) already working: fetches ≤6,000 rows from `daily_ohlcv`, filters in Python |
| Saved scans | `saved_screens` table stores `ScanFilters` JSON; re-run any time |
| Runtime | FastAPI on Railway (single process + APScheduler), Supabase managed Postgres |

**The scan DSL filters divide into two classes:**

*Single-day filters* operate on the precomputed row for a given symbol and date:
`price_above_ma`, `rs_rating_min`, `distance_from_52w_high/low`, `all_emas_bullish`,
`rsi_min/max`, `volume_ratio_min`, `pct_change_min`, `ma_stack`.

*Multi-day filters* require a time window — N recent rows per symbol:
- `volume_dry_up`: compare recent N-day volume to 50-day average
- `vcp_contraction`: detect contracting price ranges across multiple pivot bases (see §VCP detection spec below)

---

## VCP Detection Specification

VCP (Volatility Contraction Pattern) is the most complex filter. Before evaluating option (b)'s
feasibility, the definition must be concrete enough to implement.

A valid VCP, as described by Minervini, requires:
1. **Price in uptrend** — stock above its 200-day MA (handled by single-day pre-filter)
2. **Series of contracting bases** — at least 2 consecutive bases where each base has a smaller
   price range (high minus low) than the previous, expressed as a percentage of price
3. **Volume contraction** — average volume in later bases is lower than in earlier bases
4. **Pivot point** — the final base resolves into a tight handle (closes within 10–15% of the pivot high)
5. **Pivot confirmation** — a breakout above the pivot on volume ≥ 150% of 50-day average

For M3, the `vcp_contraction` filter implementation requires:
- A **lookback window** of 75 trading days (≈15 weeks) of daily data per candidate symbol
- A **pivot detection** algorithm: find local strict maxima within a ±3-bar sliding window,
  measure base depth (high-to-low percentage) at each base, verify contraction
- **Input parameters** from the DSL: `min_pivots` (minimum contracting bases, default 2),
  `max_depth_pct` (final base tightness, default 15%), `pivot_proximity_pct` (default 10%)

This definition is implementable in Python with a sorted list of daily rows per symbol. It is
**not** expressible as a simple SQL WHERE clause over precomputed columns — it inherently
requires sequential row-by-row analysis within each symbol's time series.

---

## Options

### (a) Postgres functions / views — DSL compiles to SQL, runs in-DB

A compiler translates each `Filter` into a SQL clause. Simple filters become WHERE conditions.
Complex filters use window functions or LATERAL joins.

**Pros:**
- One network round trip; the DB returns only matching rows
- For simple SEPA on 500 symbols: estimated 50–150ms (plausible for indexed boolean columns)
- "What did this find on a given date?" is a WHERE clause — trivially handled
- A 252-day historical backtest is one query: `WHERE trade_date BETWEEN x AND y GROUP BY trade_date`

**Cons — concrete for this app:**
- A DSL-to-SQL compiler for VCP (window functions over 15-week lookbacks) is significant engineering
- VCP cannot be expressed as a simple SQL window function without a stored procedure encoding the
  pivot-detection algorithm in PL/pgSQL — a maintenance burden
- Multi-timeframe filters require a separate `weekly_ohlcv` table not currently in the schema
- Debugging means reading query plans; the team is Python-first
- Migration from current PostgREST/Python approach: all 40+ filter fields must be rewritten as SQL

**Estimated latency:**
- Simple SEPA on Nifty 500: 50–150ms
- VCP (PL/pgSQL pivot detection over 15 weeks × 500 symbols = 37,500 rows): 300–700ms

---

### (b) Python worker on FastAPI — fetch precomputed rows, filter in-process

The existing implementation. A two-pass approach for complex filters:
- **Pass 1:** Push all single-day filters to the DB as WHERE clauses; fetch matching rows only
- **Pass 2 (for VCP/volume_dry_up only):** Fetch last K days for the candidate set; run Python pattern detection

**Pros:**
- Already working; M3-B measured at 171ms p50 for SEPA on a 3,046-symbol staging universe
- Adding a new filter = one Python function + one test; no compiler involved
- Saved scans: `ScanFilters` JSON is the stored format; re-running is a direct function call

**Cons — concrete for this app:**
- Multi-day pass for VCP adds complexity: separate DB calls per scan, symbol-group management in Python
- **M3-C measured VCP at 3,962ms p50 / 5,267ms p95** (500 candidates × 75 days batched over 39
  sequential HTTP round-trips at ~100ms each). This exceeded the 1,500ms p95 target by 3.5×.
- APScheduler runs in-process; a slow scan could starve the event loop
- **Backtesting is a separate problem** — see §Backtesting interaction below

---

### (c) Dedicated Python worker (Celery / RQ) — queue-triggered

**Not chosen.** Adds Redis + worker service; queue hop adds 200–500ms latency; pre-computation
only helps for saved scans not custom one-offs. Unjustified infrastructure for current scale.

---

## Backtesting Interaction

Option (b) does not handle 252-day backtests in a synchronous request. At 400ms per day ×
252 days = ~100 seconds. Backtesting must be implemented as a background job:

1. User submits a backtest request (scan definition + date range)
2. FastAPI enqueues in `scan_backtest_jobs` table (status: pending)
3. APScheduler picks it up and runs 252 passes sequentially in a thread pool
4. Frontend polls `/api/v1/backtests/{id}/status`

**If option (a) CTE approach were used for all filters:** A 252-day backtest becomes one SQL query,
executing in seconds. This remains the primary concrete advantage of (a) for historical runs.
If backtesting becomes a strict latency requirement (results in < 10s), adding a CTE-based
historical-scan path alongside option (b) is the preferred upgrade path.

---

## Decision

**Hybrid: option (b) for single-day filters + option (a) Postgres CTE for lookback-heavy passes.**

### Original decision (M3-A/B)

Option (b) — Python worker on FastAPI — was chosen for single-day SEPA filters. Rationale:

1. Already working; SEPA measured at 171ms p50 in M3-B — 57% headroom vs 400ms p50 target.
2. Adding a new single-day filter = one Python function + one push-filter clause. No SQL compiler.
3. Saved scan definitions remain `ScanFilters` JSON; no data migration on filter changes.

### Amendment — Hybrid Architecture (M3-C)

The M3-C VCP benchmark **fired the revisit trigger** (see §Revisit Triggers — FIRED):

- **Pre-fix VCP p95: 5,267ms** vs 1,500ms target — 3.5× over budget
- **Root cause:** 500 candidates ÷ 13 symbols/batch = 39 sequential HTTP round-trips at ~100ms each
- **Fix:** Replace batching with a single Postgres CTE via a security-definer RPC function
  (`get_vcp_lookback`). The function returns one JSONB row per symbol (not one row per date)
  so the PostgREST row cap is never hit. Python unpacks the history and calls `detect_vcp()`
  unchanged. One network round-trip replaces 39.
- **Post-fix target:** VCP p95 < 1,500ms (to be validated in M3-C-fix branch; ADR amendment
  is provisional until post-fix benchmark is recorded)

### The routing rule going forward

> **Any scan pass where `candidate_symbols × lookback_days > POSTGREST_ROW_CAP` must use a
> Postgres CTE (option a). All other passes stay in Python (option b).**

**Named constants (update this table if Supabase settings change):**

| Constant | Value | Where set |
|---|---|---|
| `POSTGREST_ROW_CAP` | 1,000 rows | Supabase project → Settings → API → Max rows |
| `LOOKBACK_DAYS` (VCP) | 75 trading days | `backend/app/scanners/vcp.py` |
| CTE threshold (VCP) | 1,000 / 75 = **13 symbols** | derived |

At 13 symbols × 75 days = 975 rows — one batch, just under the cap. At 14 symbols (1,050 rows)
a second batch is required and sequential-request overhead begins. For VCP at 500 candidates the
threshold is exceeded by 38×, which is why 39 sequential batches were needed and why the CTE fix
is mandatory.

**The threshold is a function of both variables.** A filter with 200-day lookback crosses the
threshold at just 5 symbols (5 × 200 = 1,000). A filter with 5-day lookback crosses at 200
symbols (200 × 5 = 1,000). Applying a fixed symbol count without the lookback term is wrong;
the formula `symbols × lookback_days > POSTGREST_ROW_CAP` is the correct gate.

**How the CTE RPC avoids the row cap:**
The SQL function does NOT return one raw row per (symbol, date) — that would be 37,500 rows for
500 symbols × 75 days, re-hitting the cap at the RPC response layer. Instead the function returns
**one row per symbol** with the OHLCV history packed as a JSONB array. At 500 symbols the RPC
response is 500 rows — well under the cap. Python unpacks each row's `history` field. This is the
architecture used in `get_vcp_lookback()` (migration 029).

```sql
-- Correct: one row per symbol, history packed as JSONB
SELECT symbol,
       jsonb_agg(
         jsonb_build_object('trade_date', trade_date, 'high', high, 'low', low,
                            'close', close, 'volume', volume)
         ORDER BY trade_date ASC
       ) AS history
FROM recent WHERE rn <= $lookback_days
GROUP BY symbol;
```

**Security-definer note:** `get_vcp_lookback` is security-definer. This is safe for `daily_ohlcv`
specifically because it is market data (not user-scoped) and has no RLS policy restricting reads.
Any future lookback function that joins user-owned tables (`watchlist_items`, `trade_journal`, etc.)
must NOT be security-definer — it must run as the caller with RLS enforced.

**Known scans that need CTE treatment (lookback × candidates > 1,000):**
- `vcp_contraction` (75 days × 500 candidates = 37,500) — being fixed in M3-C-fix
- `volume_dry_up` (proposed, 50 days): crosses threshold at 20 candidates. Any pass-1 producing
  > 20 candidates requires CTE. If pass-1 is aggressive enough to keep candidates < 20,
  Python batching is acceptable.
- Any multi-week rolling indicator (RS percentile, base count, multi-timeframe analysis)

**The CTE is data-fetch-only. Python pivot detection is unchanged.**
The `detect_vcp()` Python function and all of `backend/app/scanners/vcp.py` remain untouched.
The CTE replaces only the batching loop in `_run_vcp_pass2()` that fetched OHLCV rows.
After the CTE call returns one JSONB row per symbol, Python unpacks it and calls `detect_vcp()`
per symbol exactly as before. Nothing about the VCP algorithm moves into SQL.

**Migration path if a Python-side pass turns out to need CTE treatment:**
1. Determine the effective `lookback_days` for the pass (may be user-configurable; use the maximum)
2. Verify `candidates × lookback_days > POSTGREST_ROW_CAP` — if not, no migration needed
3. Write a SQL function (security-definer only for non-user-scoped tables) returning one JSONB
   row per symbol with the aggregated history — this keeps RPC response ≤ candidate count rows
4. Add the function in a new numbered migration; call from Python via `client.rpc()`
5. The Python detection logic stays unchanged — only the batching loop is replaced
6. Add the function to the benchmark script; verify < latency target before merge

---

## Required Optimizations (M3 must deliver)

**A. Push-filter optimization** ✅ SHIPPED (M3-B, PR #11)
All precomputed boolean and range columns expressed as DB WHERE clauses. FETCH_BATCH=6000 replaced
with a selective query. Measured: 171ms p50 / 545ms p95 for SEPA on 3,046 symbols.

**B. Two-pass VCP** ✅ SHIPPED (M3-C, PR #12) / ✅ CTE fix SHIPPED (M3-C-fix, PR #14)
`vcp_contraction` filter implemented. Pass-2 data fetch rewritten as CTE (`get_vcp_lookback`).
Pre-fix p95: 5,267ms → Post-fix p95: 910ms (5.8× improvement, +590ms headroom vs 1,500ms target).

**C. Backtest background job** — deferred; out of scope for MVP.

---

## Performance Baseline

See `docs/benchmarks/m3-phase1-baseline.md` for full run logs.

| Scan | Date | p50 | p95 | p99 | Target | Status |
|------|------|-----|-----|-----|--------|--------|
| SEPA (3,046 symbols) | 2026-04-19 | 171ms | 545ms | 678ms | p50 < 400ms | ✅ PASS |
| VCP Nifty-500 (pre-fix) | 2026-04-19 | 3,962ms | 5,267ms | 12,892ms | p95 < 1,500ms | ❌ FAIL |
| VCP Nifty-500 (post-fix) | 2026-04-21 | 631ms | 910ms | 1,831ms | p95 < 1,500ms | ✅ PASS |
| VCP all-NSE (post-fix) | 2026-04-21 | 3,815ms | 5,327ms | 9,795ms | p95 < 5,000ms | ⚠️ MARGINAL (soft) |

---

## Migration Cost If We Pick Wrong

If option (b) is abandoned entirely for option (a) later, the cost is:

- Rewrite all 40+ `ScanFilters` fields as SQL clause generators in a DSL compiler
- Rewrite `_apply_filters()` (currently 200 lines of Python) as equivalent PL/pgSQL or CTEs
- Saved scan definitions in `saved_screens` remain valid input; only the execution path changes
- Add `weekly_ohlcv` materialized view if multi-timeframe filters are needed
- Switch DB client from PostgREST to `asyncpg` for calling stored functions

Estimated: 1–2 weeks for a single engineer. The hybrid approach (option b for single-day,
CTE for multi-day) significantly reduces this cost if a full migration ever becomes necessary —
the CTE infrastructure and pattern are already in place.

---

## Revisit Triggers

### 1. Nifty 500 VCP > 1.5s p95 — **✅ RESOLVED (M3-C-fix, PR #14)**

Measured 5,267ms p95 on 2026-04-19. Root cause: 39 sequential HTTP round-trips.
**Resolution:** Replaced batching with Postgres CTE (`get_vcp_lookback`, migrations 029+030).
Post-fix p95: 910ms — 5.8× improvement, +590ms headroom. Merged 2026-04-21.

### 2. All-NSE VCP > 5s — **⚠️ MARGINAL (soft target, monitoring)**

Post-fix CTE (7 chunked calls × 500 symbols): p50=3,815ms, p95=5,327ms from Mac staging.
Cold-start run 1 (10,912ms) inflates p95; without it, p95=4,610ms (under target). Production
Railway→Supabase co-location reduces 7 round-trips by ~875ms, putting production p95 well
under 5,000ms. **Re-measure from Railway** when first production all-NSE scan is run.

### 3. Backtesting latency is a product requirement

If users must see 252-day results in < 10s, the async-job approach (minutes to complete) is
insufficient. At that point, option (a) CTE for the historical-scan path becomes warranted.

### 4. Multi-timeframe filters in the DSL

Weekly/monthly candle analysis requires a `weekly_ohlcv` materialized view not currently in schema.
Schema additions are needed regardless of option choice.

### 5. APScheduler parallelism becomes a bottleneck

At 1,000+ saved scans per day, option (c) dedicated worker becomes worth the infrastructure cost.
