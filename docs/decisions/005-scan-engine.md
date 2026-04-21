# ADR 005 — Scan Engine Architecture

> Status: **ACCEPTED**
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

**A note on latency figures in this document:** The current implementation (option b, simple SEPA
filters) has been observed in production to return in 600–900ms for the full-NSE fetch. All other
latency figures in this ADR are **estimates derived from first principles and analogous Postgres
benchmarks** — they have not been measured against this specific database and schema. They are
presented to reason about order-of-magnitude feasibility, not as guarantees. The implementation
milestones for M3 must include benchmark checkpoints; if measured latency exceeds budget, the
"What would cause us to revisit" section below defines the escalation path.

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
- A **lookback window** of 10–15 weeks of daily data per candidate symbol
- A **pivot detection** algorithm: find local highs/lows within a sliding window, measure base depth (high-to-low percentage) at each base, verify contraction
- **Input parameters** from the DSL: `minPivots` (minimum number of contracting bases, typically 2) and `minTightness` (maximum allowed depth of the final base, e.g. 15%)

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
- For simple SEPA on 500 symbols: estimated 50–150ms (plausible for indexed boolean columns; **unmeasured**)
- "What did this find on a given date?" is a WHERE clause — trivially handled
- A 252-day historical backtest is one query: `WHERE trade_date BETWEEN x AND y GROUP BY trade_date` — returns all results in a single pass

**Cons — concrete for this app:**
- A DSL-to-SQL compiler for VCP (window functions over 15-week lookbacks) is significant engineering — the SQL is complex, test coverage is hard, and the compiler itself is a new abstraction layer
- VCP cannot be expressed as a simple SQL window function without a stored procedure that encodes the pivot-detection algorithm in PL/pgSQL — a maintenance burden
- Multi-timeframe filters (weekly candle structure) require a separate `weekly_ohlcv` table not currently in the schema
- Debugging means reading query plans; the team is Python-first
- Migration from the current PostgREST/Python approach: all 40+ filter fields in `ScanFilters` must be rewritten as SQL clauses, tested for exact behavior parity, and saved scan definitions in `saved_screens` would need a compatibility shim

**Estimated latency (unmeasured):**
- Simple SEPA on Nifty 500: 50–150ms
- VCP (PL/pgSQL pivot detection over 15 weeks × 500 symbols = 7,500 rows): 300–700ms

---

### (b) Python worker on FastAPI — fetch precomputed rows, filter in-process

The existing implementation. A two-pass approach for complex filters:
- **Pass 1:** Push all single-day filters to the DB as WHERE clauses; fetch matching rows only
- **Pass 2 (for VCP/volume_dry_up only):** Fetch last K days for the candidate set; run Python pattern detection

**Pros:**
- Already working; measured at 600–900ms for unoptimized all-NSE fetch
- Push more filters DB-side → estimated 200–400ms for a SEPA scan on Nifty 500 (significant portion of latency is the current over-fetch of 6,000 rows; targeted query reduces payload by ~10×)
- VCP two-pass: after Pass 1, a SEPA pre-filter typically leaves 20–80 candidates. Pass 2 fetches last 75 trading days × 75 candidates = ~5,600 rows. Estimated: ~200ms fetch + ~50ms Python detection = ~250ms. Combined with Pass 1: ~500ms total. **This path does not exist yet; estimate is unmeasured.**
- Adding a new filter = one Python function + one test; no compiler involved
- Saved scans: `ScanFilters` JSON is the stored format; re-running is a direct function call

**Cons — concrete for this app:**
- Current implementation over-fetches (6,000 rows before filtering). Must be fixed in M3.
- Multi-day pass for VCP adds complexity: two DB calls per scan, symbol-group management in Python
- APScheduler runs in-process; a slow scan could starve the event loop. Mitigation: run scheduled scans in a thread pool via `asyncio.get_event_loop().run_in_executor()`
- **Backtesting is a separate problem** — see §Backtesting interaction below

**Estimated latency (Pass 1 measured; Pass 2 unmeasured):**
- Simple SEPA, Nifty 500 with pushed filters: 200–400ms
- SEPA + VCP, Nifty 500 (two-pass): 450–700ms (estimated)
- All-NSE VCP: likely 1,500–3,000ms (estimated; may exceed budget — see §Revisit triggers)

---

### (c) Dedicated Python worker (Celery / RQ) — queue-triggered

A separate worker process consumes jobs from Redis. FastAPI returns a task ID; frontend polls.

**Pros:**
- No event-loop starvation
- Could pre-compute scan results at 16:15 IST; on-demand scan returns cached results instantly

**Cons — concrete for this app:**
- Adds Redis + worker service: two new Railway services, new failure modes
- Queue hop adds 200–500ms of latency; on-demand scans are slower than option (b)
- Frontend polling changes the API contract meaningfully
- Pre-computation only helps if the user runs the same saved scan definition; custom one-off scans (the primary use case) still run synchronously
- Unjustified infrastructure for current scale

---

## Backtesting Interaction

The billing table commits to a "backtest" feature (blocked on free, allowed on pro/elite). A true
backtest means: run this scan on every trading day for a date range (e.g., 252 trading days) and
return what it would have found each day.

**Option (b) does not handle 252-day backtests in a synchronous request.** At 400ms per day ×
252 days = ~100 seconds of sequential execution. This exceeds any reasonable HTTP timeout and
blocks the event loop.

**How option (b) handles backtesting:**
Backtesting must be implemented as a background job, not a synchronous scan. The flow:
1. User submits a backtest request (scan definition + date range)
2. FastAPI enqueues the job in `scan_backtest_jobs` table (status: pending)
3. APScheduler picks it up and runs 252 passes sequentially in a thread pool, storing daily
   results in a `scan_backtest_results` table
4. Frontend polls `/api/v1/backtests/{id}/status` and loads results when complete

This is architecturally compatible with option (b) — it uses the same `run_scanner()` function
called 252 times, with `trade_date` as a parameter. It does require a jobs table and poll
endpoint that don't exist yet.

**If option (a) were chosen instead:** A 252-day backtest becomes one SQL query
(`WHERE trade_date BETWEEN x AND y`), executing in seconds. This is the primary concrete
advantage of (a) over (b) for this product's feature set. If backtesting becomes a high-priority
feature with a strict latency requirement (e.g., results in < 10s), option (a) or a materialized
result cache should be reconsidered.

---

## Decision

**Option (b) — Python worker on FastAPI** with two optimizations required before ship.

Rationale:

1. **It already runs.** The scanner works today for single-day filters. M3 is an optimization and extension, not a ground-up build.

2. **Simple filters meet the budget.** Push-to-DB optimization cuts Nifty 500 SEPA to an estimated 200–400ms. This must be validated with benchmark checkpoints during M3; if it doesn't hold, the revisit triggers below apply.

3. **VCP is feasible via two-pass.** The SEPA pre-filter typically reduces candidates to <100 symbols before the VCP lookback. At that scale, option (b) is estimated to stay within budget. **This is a bet that must be validated during M3 implementation.** If Nifty 500 VCP benchmark exceeds 1.5s or all-NSE VCP exceeds 5s in M3-C, move VCP execution to option (a) Postgres CTE as a scoped fix — no full architecture change needed.

4. **Backtesting is a background job, not a blocker.** The 252-day backtest limitation is resolved by implementing it as an async job, not a synchronous request. **Instant backtesting (< 10s historical scans) is out of scope for MVP.** If user demand emerges post-launch, the preferred path is adding option (a) Postgres-side compilation as a dedicated historical-scan path alongside option (b) — not replacing it. The Minervini/Qullamaggie audience thinks in weeks, not milliseconds; over-engineering before demand is wasteful.

5. **Lower total cost for current phase.** No SQL compiler to build, no new infrastructure, no API contract changes. The incremental investment over the working implementation is measured in days, not weeks.

### Required optimizations (M3 must deliver)

**A. Push-filter optimization:** All precomputed boolean and range columns in `daily_ohlcv` must be
expressed as DB WHERE clauses, not Python post-filters. The `FETCH_BATCH = 6000` fixed pull must
be replaced with a selective query. Target: ≤500 rows returned for a typical SEPA scan.

**B. Two-pass VCP:** Implement `vcp_contraction` filter using the spec above. Pass 2 triggers
only after Pass 1 produces a candidate set; never fetches multi-day data for the full universe.
Add a benchmark checkpoint: VCP scan on Nifty 500 must complete in < 1.5s end-to-end.

**C. Backtest background job:** Design and implement the job table + polling endpoint. The
synchronous `run_scanner()` function is reused unchanged.

---

## Migration Cost If We Pick Wrong

If option (b) is abandoned for option (a) later, the cost is:

- Rewrite all 40+ `ScanFilters` fields as SQL clause generators in a DSL compiler
- Rewrite `_apply_filters()` (currently 200 lines of Python) as equivalent PL/pgSQL or CTEs; test for exact behavior parity including edge cases (None handling, dual-alias fields like `w52h_pct_max` / `week_52_high_pct_max`)
- Saved scan definitions in `saved_screens` are stored as `ScanFilters` JSON; they remain valid as input to the compiler, so no data migration is needed — only the execution path changes
- Add `weekly_ohlcv` materialized view if multi-timeframe filters are needed
- Switch DB client from PostgREST to `asyncpg` for calling stored functions

Estimated: 1–2 weeks for a single engineer. Not catastrophic, but non-trivial. This reinforces
the importance of the M3 benchmark checkpoints: if (b) is going to fail, we want to know at
Pass-1 optimization time, not after VCP is fully built on top of it.

---

## What Would Cause Us to Revisit

1. **All-NSE VCP measured above 3s** after push-filter optimization. At that point, option (a)'s window functions or a pre-computation cache become worth the complexity.

2. **Backtesting latency is a product requirement** (e.g., user must see 252-day results in under 10s). Option (b)'s async-job approach delivers results in minutes, not seconds. If competitive pressure demands near-instant historical runs, option (a) is the right answer.

3. **Multi-timeframe filters in the DSL** (weekly/monthly candle analysis). These require data the current schema doesn't have and would need schema additions regardless of option choice.

4. **APScheduler parallelism becomes a bottleneck** (e.g., alert system running 1,000+ saved scans per day). At that scale, option (c)'s dedicated worker with horizontal scaling becomes worth the infrastructure cost.
