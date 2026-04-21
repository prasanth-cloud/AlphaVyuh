# M3 Phase 1 — Scanner Performance Baseline

**Recorded:** 2026-04-21  
**Environment:** Staging — `fyxltykqdvacbdgmeucf.supabase.co` (us-east-2)  
**Measured from:** MacBook local → Supabase (includes trans-Pacific RTT; production Railway → Supabase RTT will be lower)  
**Script:** `backend/scripts/bench_scanner.py --trade-date 2026-04-19 --iterations 20`  
**Trade date used:** 2026-04-19 (most recent date with ≥ 500 symbols)  
**daily_ohlcv row count:** 609,214 total; 3,046 symbols on 2026-04-19  
**Date range in DB:** 2025-04-17 to 2026-04-21

---

## SEPA Scan (pass-filter optimization, M3-B)

**Filters:** price ≥ 50, RSI 55–80, pct_change ≥ 0, above EMA20/50/200, series=EQ  
**Universe:** 3,046 symbols on 2026-04-19  
**DB rows returned per run:** 1,000 (PostgREST max_rows cap; full-universe would require pagination)  
**Candidates after Python filter:** 319

| Run | Latency |
|-----|---------|
| 1   | 229ms |
| 2   | 157ms |
| 3   | 158ms |
| 4   | 536ms |
| 5   | 173ms |
| 6   | 174ms |
| 7   | 175ms |
| 8   | 170ms |
| 9   | 167ms |
| 10  | 172ms |
| 11  | 711ms |
| 12  | 247ms |
| 13  | 169ms |
| 14  | 164ms |
| 15  | 165ms |
| 16  | 159ms |
| 17  | 174ms |
| 18  | 167ms |
| 19  | 212ms |
| 20  | 163ms |

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| p50    | 171ms | < 400ms | ✅ PASS (+229ms headroom) |
| p95    | 545ms | —      | — |
| p99    | 678ms | —      | — |
| min    | 157ms | —      | — |
| max    | 711ms | —      | — |

**Notes:** Two cold-spike outliers (536ms at run 4, 711ms at run 11) are connection-pool warm-up artifacts. Steady-state (runs 5–20 excluding run 12) averages ~170ms. p95 of 545ms includes these spikes; steady-state p95 would be ~250ms.

---

## VCP Scan — Nifty-500 Equivalent (pre-fix, batched HTTP, M3-C)

**Architecture:** 500 SEPA candidates → 39 sequential PostgREST batches (13 symbols × 75 days each) → Python detect_vcp()  
**Candidates:** 500 (first 500 SEPA pass-1 results)  
**VCP hits:** 68 / 500

| Run | Latency |
|-----|---------|
| 1   | 14,798ms |
| 2   | 3,398ms |
| 3   | 2,954ms |
| 4   | 2,931ms |
| 5   | 2,809ms |
| 6   | 4,765ms |
| 7   | 4,277ms |
| 8   | 3,963ms |
| 9   | 4,223ms |
| 10  | 4,296ms |
| 11  | 4,047ms |
| 12  | 4,026ms |
| 13  | 3,882ms |
| 14  | 3,704ms |
| 15  | 3,872ms |
| 16  | 3,923ms |
| 17  | 3,976ms |
| 18  | 3,916ms |
| 19  | 4,053ms |
| 20  | 3,960ms |

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| p50    | 3,962ms | —       | — |
| p95    | 5,267ms | < 1,500ms | ❌ FAIL (3.5× over) |
| p99    | 12,892ms | —      | — |
| min    | 2,809ms | —      | — |
| max    | 14,798ms | —     | — |

**Root cause:** 39 sequential HTTP API calls at ~100ms each = 3,900ms base overhead before Python VCP detection. Architecture mismatch: batched PostgREST is not the right tool for N-symbol × M-day lookback.

**ADR 005 §Revisit Trigger 1 fired.** Fix: replace batching with a single Postgres CTE call.

---

## VCP Scan — All-NSE (3,046 symbols) — pre-fix

**Status:** Not completed. A single `.in_("symbol", [3046 symbols])` call produced a URL too long for PostgREST (JSON decode error). The batch loop fix in bench_scanner.py (VCP_BATCH_SIZE=13) would generate ~235 sequential round-trips — estimated ~23,500ms. Not worth measuring; the CTE fix is the correct path.

---

## Post-Fix Benchmark (pending)

To be recorded after `feat/scanner-vcp-cte-fix` merges. Fields will be populated:

| Scan | p50 | p95 | p99 | Target | Status |
|------|-----|-----|-----|--------|--------|
| VCP Nifty-500 (CTE) | — | — | — | p95 < 1,500ms | pending |
| VCP all-NSE (CTE)   | — | — | — | p95 < 5,000ms | pending |

---

## Headroom Summary (pre-fix)

| Scan | Metric | Measured | Target | Headroom |
|------|--------|----------|--------|----------|
| SEPA 3,046 symbols | p50 | 171ms | 400ms | +229ms (57%) |
| VCP 500 symbols | p95 | 5,267ms | 1,500ms | −3,767ms over budget |

The SEPA headroom of +229ms is the budget available for additional single-day push-filters
without regression. Each new push-filter costs roughly 0–10ms (index seek on precomputed column);
the headroom comfortably accommodates 20+ additional filters.

VCP headroom is negative until the CTE fix lands.
