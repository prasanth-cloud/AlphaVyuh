# Scan Filters Catalog

> **Purpose:** This is the authority on which filters alphavyuh will support, their data
> sources, implementation cost, and latency impact. It drives M3 scope decisions and informs
> UI/UX design. Nothing here is implemented until a PR exists; this is the spec.
>
> **Competitive research:** Chartink, Tickertape, Screener.in — referenced throughout.
>
> **Performance baseline (2026-04-21, Mac → Supabase staging):**
> - Single-day push-filter scan (SEPA, 3,046 symbols): p50 = 154ms, headroom = +246ms
> - VCP two-pass scan (Nifty-500, 500 candidates): p95 = 910ms, headroom = +590ms
> - Both numbers measured from Mac; Railway production will be materially lower.

---

## Cost categories

| Category | Definition | Latency |
|---|---|---|
| **FREE** | Precomputed in `daily_ohlcv` or `stock_universe`. Added as a WHERE clause. | 0–5ms |
| **CHEAP** | Derivable in SQL from existing columns — one computed expression, no multi-row window. | 5–15ms |
| **EXPENSIVE** | Multi-day lookback. Triggers the CTE routing rule when `candidates × lookback_days > 1,000`. | +300–600ms on top of single-day scan |
| **NEW DATA** | Requires a new ingest pipeline. Column does not exist in the current schema. | N/A until column exists, then FREE |
| **NEW ARCHITECTURE** | In composition with existing EXPENSIVE filters (e.g. VCP), would push Nifty-500 p95 past 1,500ms. Needs a dedicated perf analysis and possibly async concurrency before landing. | > 1,500ms p95 in composition |

---

## Technical Filters (1–20)

Latency estimates assume ~500 Nifty-500 candidates after pass-1. Baseline: VCP already
consumes 910ms p95 of the 1,500ms budget; remaining headroom = 590ms.

---

### 1. Price range

| Field | `price_min`, `price_max` |
|---|---|
| Status | Implemented |
| Column | `daily_ohlcv.close` |
| Definition | Closing price of the session in INR (or USD for US market symbols). |
| Cost | FREE |
| Latency | 0–3ms |
| Notes | Common liquidity gate: `price_min = 50` excludes sub-₹50 penny stocks. |

---

### 2. % Change today

| Field | `pct_change_min`, `pct_change_max` |
|---|---|
| Status | Implemented |
| Column | `daily_ohlcv.pct_change` |
| Definition | `(close − prev_close) / prev_close × 100`. Precomputed at ingest. Positive = up day. |
| Cost | FREE |
| Latency | 0–3ms |
| Competitive | All major Indian scanners expose this. |

---

### 3. Volume ratio (vs 20-day average)

| Field | `volume_ratio_min`, `volume_ratio_max` |
|---|---|
| Status | Implemented |
| Column | `daily_ohlcv.volume_ratio` = `volume / avg_volume_20d` |
| Definition | Today's volume as a multiple of the 20-session simple moving average of volume. 1.0 = average; 2.0 = twice average. avg_volume_20d precomputed at ingest (arithmetic mean over last 20 sessions, excluding the current session). |
| Cost | FREE |
| Latency | 0–3ms |
| Competitive | Chartink uses this. Tickertape shows it but doesn't filter on it directly. |

---

### 4. RSI(14)

| Field | `rsi_min`, `rsi_max` |
|---|---|
| Status | Implemented |
| Column | `daily_ohlcv.rsi_14` |
| Definition | Relative Strength Index, 14-period. Wilder smoothing (EMA with α = 1/14). RS = avg_gain / avg_loss; RSI = 100 − 100/(1+RS). Range: 0–100. Threshold convention: > 70 overbought, < 30 oversold. |
| Cost | FREE |
| Latency | 0–3ms |
| Competitive | Present on all three reference platforms. |

---

### 5. EMA position (20 / 50 / 200)

| Field | `price_vs_ema20`, `price_vs_ema50`, `price_vs_ema200` (`'above'` \| `'below'`) |
|---|---|
| Status | Implemented |
| Columns | `daily_ohlcv.ema_20`, `ema_50`, `ema_200` |
| Definition | Exponential moving average with period N and smoothing factor α = 2/(N+1). Precomputed daily at ingest. Filter: close > EMA_N or close < EMA_N. |
| Cost | FREE |
| Latency | 0–3ms per condition |
| Notes | EMAs react faster than SMAs to recent price. Minervini's trend template historically used SMAs; our UI uses EMAs. Both should be exposed — see filter #7. |

---

### 6. EMA alignment (bullish/bearish stack)

| Field | `all_emas_bullish`, `all_emas_bearish`, `ema20_above_ema50`, `ema50_above_ema200` |
|---|---|
| Status | Implemented |
| Columns | derived from ema_20, ema_50, ema_200 |
| Definition | `all_emas_bullish` = EMA20 > EMA50 > EMA200. A single composite flag checked in `_apply_filters`. Minervini Trend Template criterion #3. |
| Cost | FREE |
| Latency | 0–3ms |

---

### 7. SMA position (50 / 150 / 200) + Minervini SMA stack

| Field | `price_vs_sma50`, `price_vs_sma150`, `price_vs_sma200`, `sma_stack_bullish` (proposed) |
|---|---|
| Status | **NOT IMPLEMENTED** as filter fields. Columns are precomputed in schema. |
| Columns | `daily_ohlcv.sma_50`, `sma_150`, `sma_200` (all precomputed at ingest) |
| Definition | Simple moving average: arithmetic mean of the last N closing prices (period = 50, 150, or 200). SMA reacts more slowly than EMA. Minervini's published SEPA criteria in *Trade Like a Stock Market Wizard* use SMA 150 and SMA 200 (not EMA) — our current SEPA preset uses EMAs, which is a documented deviation (see OQ1). `sma_stack_bullish` = close > SMA50 > SMA150 > SMA200. This covers Minervini Trend Template criteria 1–3; Criterion 4 (SMA200 trending up for ≥1 month) requires a multi-day lookback and is EXPENSIVE — it is **not** included in this flag. |
| Cost | **FREE** (columns precomputed; need ScanFilters fields and `_apply_filters` WHERE clauses — no SQL computation) |
| Latency | 0–3ms |
| M3 scope | **YES** — add four fields. Two-line change per field in `_apply_filters`. Merge with filter #18 which was a duplicate. |

---

### 8. 52-Week range proximity

| Field | `w52h_pct_max`, `w52l_pct_min`, `new_52w_high`, `new_52w_low` |
|---|---|
| Status | Implemented |
| Columns | `daily_ohlcv.week_52_high`, `week_52_low`, `w52h_pct`, `w52l_pct` |
| Definition | `w52h_pct` = `(week_52_high − close) / close × 100` (distance below 52W high, using close as denominator). `w52l_pct` = `(close − week_52_low) / week_52_low × 100` (distance above 52W low). `new_52w_high` = `close >= week_52_high`. Rolling 52-week window updated daily at ingest. **Formula note:** Using `close` (not `week_52_high`) as the denominator for `w52h_pct` is our implementation choice. Chartink and Screener.in use `week_52_high` as the denominator, giving a slightly smaller percentage for the same price gap. Example: close=90, 52W high=100 → our formula gives 11.1%; Chartink's gives 10.0%. Both are defensible; ours is documented and consistent. |
| Cost | FREE |
| Latency | 0–3ms |
| Competitive | All major Indian scanners. Note the denominator difference vs Chartink for `w52h_pct` — user-facing UI should clarify the formula. |

---

### 9. Minervini RS Score (1–99)

| Field | `rs_score_min`, `rs_score_max` |
|---|---|
| Status | Implemented |
| Column | `daily_ohlcv.rs_score` |
| Definition | Rank-percentile of the stock's 12-month price performance vs the full universe (heavier weight on the most recent quarter). RS = 99 means the stock outperformed 99% of all stocks. Computed daily at ingest. **This is NOT the IBD RS Rating** (which benchmarks against the S&P 500 specifically) — ours benchmarks against the NSE universe. |
| Cost | FREE |
| Latency | 0–3ms |
| Competitive | Not available on Chartink, Tickertape, or Screener.in. This is a differentiator. |
| Caveat | Named "RS Score" (not "RS Rating") to avoid IBD trademark confusion — ADR 006 §Decision 5. |

---

### 10. ATR % (volatility band filter)

| Field | `atr_pct_min`, `atr_pct_max` |
|---|---|
| Status | Implemented |
| Columns | `daily_ohlcv.atr_14`, derived as `atr_14 / close × 100` |
| Definition | Average True Range over 14 periods, Wilder's smoothed moving average (RMA). True Range = max(high−low, |high−prev_close|, |low−prev_close|). ATR recurrence: `ATR[t] = (ATR[t−1] × 13 + TR[t]) / 14` (α = 1/14, not the standard EMA α = 2/15 — these produce different values). ATR% normalises the raw ATR by price, making it comparable across price levels. High ATR% = wide daily ranges; low ATR% = tight, consolidating stock. |
| Cost | FREE |
| Latency | 0–3ms |
| Use case | Filter for stocks in VCP consolidation: `atr_pct_max = 2.5` finds tight setups. |

---

### 11. MACD signal

| Field | `macd_signal` (`'bullish_cross'` \| `'bearish_cross'` \| `'above_signal'` \| `'below_signal'`), `macd_hist_positive` |
|---|---|
| Status | Implemented |
| Columns | `daily_ohlcv.macd_line`, `macd_signal`, `macd_hist` |
| Definition | Standard MACD (12, 26, 9): Line = EMA(12) − EMA(26), both with α = 2/13 and 2/27 respectively. Signal = EMA(9) of Line (α = 2/10). Histogram = Line − Signal. `above_signal`/`below_signal`: today's `macd_hist > 0` or `< 0`. `macd_hist_positive`: synonym for above_signal. Explicit cross formula: **bullish_cross = `macd_hist[today] > 0 AND macd_hist[prev] ≤ 0`**; bearish_cross = `macd_hist[today] < 0 AND macd_hist[prev] ≥ 0`. The ≤/≥ boundary at zero is the canonical definition — "exactly zero" counts as not crossed. |
| Cost | **CHEAP** (cross detection requires `prev_macd_hist` precomputed in `daily_ohlcv`; `above_signal`/`macd_hist_positive` are FREE) |
| Latency | `above_signal` / `below_signal`: 0–3ms (WHERE clause on `macd_hist`). Cross variants: 0–3ms if `prev_macd_hist` column is precomputed; otherwise requires a 2-day CTE (EXPENSIVE). **Action required: verify `prev_macd_hist` is precomputed at ingest.** If not, either add the column (recommended) or restrict `macd_signal` to `above_signal`/`below_signal` only until it is. |
| Competitive | Present on Chartink. |

---

### 12. Bollinger Band position / squeeze

| Field | `bb_position`, `bb_width_min`, `bb_width_max` |
|---|---|
| Status | Implemented |
| Columns | `daily_ohlcv.bb_upper`, `bb_middle`, `bb_lower`, `bb_width` |
| Definition | Bollinger Bands: middle = SMA(20); upper/lower = middle ± 2σ (σ = 20-period standard deviation of close). `bb_width` = (upper − lower) / middle. Low `bb_width` = volatility squeeze — a Bollinger Band Squeeze (BBS) often precedes a large move. |
| Cost | FREE |
| Latency | 0–3ms |
| Competitive | Chartink has BB position. No Indian scanner exposes BB squeeze width filter explicitly — this is a differentiator. |

---

### 13. ADX(14) trend strength

| Field | `adx_min`, `adx_max` |
|---|---|
| Status | Implemented |
| Column | `daily_ohlcv.adx_14` |
| Definition | Average Directional Index, 14-period. Wilder smoothing (RMA, α = 1/14 — same recurrence as ATR). ADX = 100 × RMA(|+DI − −DI| / (+DI + −DI), 14). ADX measures trend strength, not direction. ADX < 20 = no clear trend; ADX 20–25 = weak trend; ADX > 25 = trending; ADX > 40 = strong trend. |
| Cost | FREE |
| Latency | 0–3ms |
| Use case | Combine with EMA alignment: `all_emas_bullish + adx_min = 25` = confirmed uptrend. |

---

### 14. Delivery % (NSE-specific)

| Field | `delivery_pct_min`, `delivery_pct_max` |
|---|---|
| Status | Implemented |
| Column | `daily_ohlcv.delivery_pct` |
| Definition | Percentage of total traded volume that went to delivery (actual share ownership change), not intraday square-off. High delivery % (> 50–60%) signals institutional accumulation or strong retail conviction. Available from NSE bhavcopy (CM bhavcopy includes delivery data). |
| Cost | FREE |
| Latency | 0–3ms |
| Availability | NSE EQ series only. Not available for F&O-settled, BSE-only, or US market symbols. |
| Competitive | Chartink exposes this. Tickertape and Screener.in do not. This is an India-market differentiator. |

---

### 15. Inside bar

| Field | `is_inside_bar` |
|---|---|
| Status | Implemented |
| Column | `daily_ohlcv.is_inside_bar` |
| Definition | `high < prev_high AND low > prev_low`. The entire day's range is contained within the prior day. Signals range contraction; a common consolidation pattern before continuation or reversal. |
| Cost | FREE |
| Latency | 0–3ms |
| Note | `is_outside_bar` (the inverse, where today's range completely engulfs the prior day) is also implemented. |

---

### 16. VCP contraction

| Field | `vcp_contraction`, `vcp_min_pivots`, `vcp_max_depth_pct`, `vcp_pivot_proximity_pct` |
|---|---|
| Status | Implemented (two-pass) |
| Source | `backend/app/scanners/vcp.py` using 75-day OHLCV lookback via `get_vcp_lookback` CTE |
| Definition | Minervini Volatility Contraction Pattern. Full spec: `docs/decisions/005-scan-engine.md §VCP Detection Specification`. In brief: ≥ `vcp_min_pivots` (default 2) consecutive contracting bases where each base's depth < prior × 0.95, mean volume decreasing per base, final base depth ≤ `vcp_max_depth_pct` (default 15%), and current close within `vcp_pivot_proximity_pct` (default 10%) of the last pivot high. |
| Cost | EXPENSIVE |
| Latency | +910ms p95 on Nifty-500 as a standalone pass-2. In composition with other pass-2 filters that share the same CTE data (e.g. volume dry-up on the same lookback), no additive CTE round-trip cost — additional cost is Python-only. |
| Budget consumed | 910ms of the 1,500ms Nifty-500 budget = 61%. Remaining: 590ms for future additions. |
| Competitive | No other Indian scanner implements VCP detection. **This is the primary differentiator.** |

---

### 17. Volume dry-up

| Field | `volume_dryup` (proposed), `voldryup_days` (default 10), `voldryup_vs_avg_pct_max` (default 60) |
|---|---|
| Status | **NOT IMPLEMENTED** |
| Source | Would use the existing 75-day CTE data from `get_vcp_lookback` (shared pass-2 fetch) |
| Definition | The most recent `voldryup_days` sessions (default 10) have average volume ≤ `voldryup_vs_avg_pct_max` % of the 50-day average volume. Indicates drying up of supply — a Qullamaggie prerequisite for VCP entry. |
| Cost | **CHEAP when combined with VCP** (same 75-day CTE data fetch, additional Python computation only); **EXPENSIVE standalone** |
| Latency | **With VCP:** ~50ms additional Python (no new CTE round-trip). Combined p95 = ~960ms. ✅ Within budget. **Standalone Nifty-500:** 50-day lookback CTE threshold = 1,000/50 = **20 candidates**. Any pass-1 producing > 20 candidates requires a CTE. A typical pass-1 returns 200–500 candidates — so standalone volume dry-up almost always triggers the CTE on Nifty-500. Estimated latency: 500 candidates × 50 days = 25,000 rows in JSONB → ~600–900ms (larger payload per row, fewer rows than VCP 75-day, but ~33% of the VCP CTE cost at 500 candidates). **Do not model this as ~450ms; the realistic range is 600–900ms for a 500-candidate standalone run.** ✅ Still within budget. |
| Implementation | `detect_vcp()` already receives the 75-day history. Add `detect_volume_dryup(rows, days=10, max_pct=60)` to `vcp.py`; call it in `_run_vcp_pass2`. The 75-day window covers the 50-day lookback needed for the baseline average. Standalone (without VCP): a separate CTE call or a new `get_volume_dryup_lookback` function with 50-day window. |
| M3 scope | **YES (with VCP only).** Standalone volume dry-up deferred until all-NSE perf is resolved — standalone at all-NSE scale would be 3,046 candidates × 50 days = very large CTE across 7 chunks. |

---

### 18. Consecutive up/down closes

| Field | `consec_up_min`, `consec_down_min` (proposed) |
|---|---|
| Status | **NOT IMPLEMENTED** |
| Source | Would require multi-day lookback (N consecutive days of close > prev_close) |
| Definition | `consec_up_min = N`: the last N sessions all closed higher than the prior session's close. `consec_down_min = N`: inverse. Qullamaggie describes entering positions after 2–3 consecutive tight up-closes into resistance. |
| Cost | **EXPENSIVE** — requires per-symbol N-day sequential comparison. CTE threshold: at N=3 days, 1000/3 = 333 candidates. For a 500-candidate Nifty-500 pass-1, a 3-day CTE is needed. |
| Latency | CTE with 3-day lookback: threshold at 333 candidates. At 500 candidates, ~300ms estimated (smaller payload than VCP: 500 × 3 = 1,500 rows, less than VCP's 500 × 75). In composition with VCP (which already fetches 75 days): computed from existing CTE data, ~10ms Python. |
| Implementation | If combined with VCP pass-2: trivially compute from the last N rows of the existing `by_symbol` history dict — no extra CTE needed. If standalone: small dedicated CTE or add `prev_close_1d`, `prev_close_2d` precomputed columns to avoid CTE entirely. |
| Competitive | Chartink exposes "Number of consecutive up/down days." Present in Indian retail scanning workflows. |
| M3 scope | Deferred. Implement as a VCP co-filter (free when combined with VCP). Standalone deferred until all-NSE perf is resolved. |

---

### 19. N-day price momentum (5 / 10 / 20-day % change)

| Field | `pct_change_5d_min`, `pct_change_10d_min`, `pct_change_20d_min` (proposed) |
|---|---|
| Status | **NOT IMPLEMENTED**. Columns don't exist. |
| Definition | `pct_change_Nd` = (close_today − close_N_sessions_ago) / close_N_sessions_ago × 100. Medium-term momentum signal. Commonly used to confirm stocks that are outperforming over multiple timeframes. |
| Cost | **NEW DATA** if added as precomputed columns (then becomes FREE); **EXPENSIVE** if computed on-demand via CTE (5-day lookback: threshold at 200 candidates × 5 = 1,000). |
| Recommended approach | Add `pct_change_5d`, `pct_change_10d`, `pct_change_20d` to the bhavcopy ingest (simple lookback from existing data in the same ingest run). Schema migration required. Once added, cost = FREE. |
| Latency (if precomputed) | 0–3ms |
| Competitive | Chartink ("Price change last N days"), Tickertape ("N-day return"), Screener.in ("Return over N days"). Available on all reference platforms. |
| M3 scope | Schema migration + ingest change required. Recommend M3 ingest sprint. |

---

### 20. Supertrend indicator

| Field | `supertrend_signal` (`'bullish'` \| `'bearish'`) (proposed) |
|---|---|
| Status | **NOT IMPLEMENTED**. Column doesn't exist. |
| Definition | Supertrend(10, 3). ATR(10) uses Wilder smoothing (α = 1/10). Basic bands each bar: `basic_upper[t] = (high+low)/2 + 3×ATR(10)[t]`; `basic_lower[t] = (high+low)/2 − 3×ATR(10)[t]`. **Final bands apply band-locking (the sticky logic):** `final_upper[t] = min(basic_upper[t], final_upper[t−1])` if `close[t−1] ≤ final_upper[t−1]`, else `basic_upper[t]`. `final_lower[t] = max(basic_lower[t], final_lower[t−1])` if `close[t−1] ≥ final_lower[t−1]`, else `basic_lower[t]`. Signal: `supertrend_bullish = True` when `close[t] > final_lower[t]` (and previous signal was not already bullish above final_lower). This band-locking is what makes Supertrend a trend-following indicator rather than a plain volatility channel — without it the output is incorrect. |
| Cost | **NEW DATA** — computable entirely from existing OHLCV; no external feed. Add `supertrend_bullish` (boolean) to bhavcopy ingest. |
| Latency (if precomputed) | 0–3ms |
| Competitive | Chartink exposes Supertrend and it is heavily used by Indian retail traders. Tickertape shows it on charts but not as a scanner filter. |
| M3 scope | Yes — popular, easy ingest addition, high user demand. |

---

## Fundamental Filters

### Already implemented

All from `stock_universe` table. **Critical caveat:** These columns appear to be seeded once
from an initial data import. There is no confirmed daily/weekly refresh pipeline. Stale
fundamentals are worse than no fundamentals — they mislead users. See OQ2.

| Filter | Field | Column | Source |
|--------|-------|--------|--------|
| Market cap | `market_cap_min/max` | `stock_universe.market_cap_cr` (₹ Crores) | NSE/BSE |
| P/E ratio | `pe_min/max` | `stock_universe.pe_ratio` | NSE/BSE |
| P/B ratio | `pb_min/max` | `stock_universe.pb_ratio` | NSE/BSE |
| EPS | `eps_min/max` | `stock_universe.eps` | NSE/BSE |
| Dividend yield | `dividend_yield_min/max` | `stock_universe.dividend_yield` | NSE/BSE |
| Debt-to-equity | `debt_to_equity_max` | `stock_universe.debt_to_equity` | NSE/BSE |
| ROE | `roe_min` | `stock_universe.roe` | NSE/BSE |
| ROCE | `roce_min` | `stock_universe.roce` | NSE/BSE |

### Proposed new fundamental filters

#### F1. Revenue growth (QoQ / YoY)

**Definition:** Net sales percentage change quarter-over-quarter or trailing-twelve-months YoY.  
**Why:** Minervini's SEPA requires EPS acceleration, which correlates with revenue growth. Chartink doesn't offer this; Tickertape and Screener.in do. It's a differentiator with value.  
**Source options:**

| Option | Cost | Legal posture | Freshness | Engineering effort |
|--------|------|--------------|-----------|-------------------|
| **Financial Modeling Prep (FMP)** | $49/month (Starter: 15K calls/day) | Commercial license — clearly permitted | Quarterly | Low — structured REST API |
| BSE XBRL filings (direct) | Free | Public filings — legally clean | Quarterly | High — XBRL parsing is non-trivial |
| Screener.in scraping | Free | **NOT RECOMMENDED** — violates ToS | Quarterly | Medium |
| Tickertape scraping | Free | **NOT RECOMMENDED** — violates ToS | Quarterly | Medium |

**Recommendation:** FMP at $49/month if India coverage is verified. **Caveat:** FMP's Starter tier call limits are well-documented for US stocks; India endpoint coverage and call limits require direct verification before the catalog recommendation becomes a spend decision. Specifically: does FMP's $49 tier cover all 3,000+ NSE symbols (including SME/BE series, not just Nifty 1000)? What are the actual India call rate limits? This must be verified against FMP's documentation or sales — do not approve the spend based on this catalog alone. If coverage is partial (e.g. Nifty 1000 only), the BSE XBRL path becomes more attractive. See OQ3.

---

#### F2. Profit growth (PAT QoQ / YoY)

**Definition:** Profit After Tax percentage change quarter-over-quarter or YoY.  
**Source:** Same as F1 (FMP).  
**Notes:** Should expose both quarterly (QoQ) and annual (YoY). Minimum threshold filters like "PAT growth > 25% YoY" are Minervini's EPS acceleration criteria applied to Indian reporting.

---

#### F3. Promoter holding %

**Definition:** Percentage of total equity held by company promoters (founders/controlling shareholders). SEBI mandates quarterly disclosure.  
**Why:** Declining promoter holding = risk signal. High and stable = alignment of interest.  
**Source:** BSE/NSE shareholding pattern filings (public). FMP also covers this.  
**Update frequency:** Quarterly. No need for daily refresh.  
**Legal posture:** Public BSE/NSE filings — no licensing issues.

---

#### F4. FII/DII holding %

**Definition:** Foreign Institutional Investor and Domestic Institutional Investor shareholding percentage. Rising FII = global institutional interest.  
**Source:** BSE/NSE shareholding pattern filings (same quarterly filing as F3).  
**Notes:** FII and DII should be separate filterable fields, not combined.

---

#### F5. EV/EBITDA

**Definition:** Enterprise Value / EBITDA. EV = market cap + total debt − cash. More meaningful than P/E for capital-intensive businesses.  
**Source:** FMP (provides TTM EBITDA and EV components).  
**Notes:** Requires quarterly financials; stale by one quarter maximum.

---

## Competitive comparison

| Filter | Chartink | Tickertape | Screener.in | alphavyuh now | alphavyuh proposed |
|--------|----------|------------|-------------|---------------|-------------------|
| Price / % change | ✅ | ✅ | ✅ | ✅ | ✅ |
| Volume ratio (vs avg) | ✅ | ✅ | — | ✅ | ✅ |
| RSI, MACD, BB, Stoch, ADX | ✅ | ✅ | — | ✅ | ✅ |
| EMA position (20/50/200) | ✅ | ✅ | — | ✅ | ✅ |
| **SMA position (50/150/200)** | ✅ | ✅ | — | ❌ | ✅ M3 |
| Delivery % | ✅ | — | — | ✅ | ✅ |
| 52-week proximity | ✅ | ✅ | ✅ | ✅ | ✅ |
| Minervini RS Score | Partial | — | — | ✅ | ✅ |
| **VCP detection** | — | — | — | ✅ | ✅ **Differentiator** |
| **Volume dry-up** | ✅ | — | — | ❌ | ✅ M3 |
| **N-day momentum (5/10/20d)** | ✅ | ✅ | ✅ | ❌ | ✅ M3 (ingest) |
| **Supertrend** | ✅ | Chart only | — | ❌ | ✅ M3 (ingest) |
| BB squeeze (width filter) | — | — | — | ✅ | ✅ **Differentiator** |
| Fundamentals (PE/PB/ROE/ROCE) | — | ✅ | ✅ | ✅ | ✅ |
| Revenue / profit growth | — | ✅ | ✅ | ❌ | Proposed (FMP) |
| Promoter / FII holding | — | ✅ | ✅ | ❌ | Proposed (FMP/BSE) |
| EV/EBITDA | — | ✅ | ✅ | ❌ | Proposed (FMP) |
| Consecutive up/down days | ✅ | — | — | ❌ | Deferred (VCP co-filter) |
| OBV trend | ✅ | — | — | ❌ | Not planned — see below |

---

## Deliberately excluded filters

### OBV trend (On Balance Volume)

OBV (On Balance Volume) is present in `backend/app/routers/scanner.py` as a commented consideration (`# ── Delivery / OBV ───`) alongside delivery percentage. It is **not included** in the technical filter catalog for the following reasons:

1. OBV trend (rising/falling over N days) is multi-day — EXPENSIVE by definition. It would need a CTE call in composition with an already-expensive VCP pass-2.
2. Delivery % serves the same intent for NSE (confirming institutional conviction) with better data quality and is already FREE. OBV adds noise without adding signal over delivery % for the target user (NSE swing trader, not US-market trader).
3. Minervini and Qullamaggie do not use OBV explicitly in their published methodologies.

**Decision: OBV trend is deliberately excluded from the M3 filter set.** If a user specifically requests it, revisit as a post-M3 addition with a standalone CTE.

---

## Latency impact summary

Additive latency on a Nifty-500 scan composition (500 candidates, VCP already running):

| Filter | Category | Added latency | Budget after VCP | In-budget? |
|--------|----------|---------------|-----------------|-----------|
| #1–6 (price, pct, vol, RSI, EMA) | FREE | 0–5ms each | 590ms | ✅ |
| #7 SMA position/stack (FREE, cols exist) | FREE | 0–3ms | 590ms | ✅ |
| #8–15 (52W, RS, ATR, MACD `above/below`, BB, ADX, delivery, inside bar) | FREE | 0–5ms each | 590ms | ✅ |
| **#11 MACD cross variants** | CHEAP (needs `prev_macd_hist` column) | 0–3ms (if precomputed) | 590ms | ✅ — pending column verification |
| #16 VCP | EXPENSIVE | 910ms (baseline) | 590ms remaining | ✅ |
| **#17 Volume dry-up (with VCP, shared CTE)** | CHEAP | ~50ms Python | 540ms | ✅ |
| **#17 Volume dry-up (standalone, 500 cands)** | EXPENSIVE | 600–900ms CTE | N/A (no VCP consumed) | ✅ |
| **#18 Consecutive up/down (with VCP, shared data)** | CHEAP | ~10ms Python | ~530ms | ✅ |
| **#19 N-day momentum (precomputed)** | FREE (after ingest) | 0–3ms | 590ms | ✅ |
| **#20 Supertrend (precomputed)** | FREE (after ingest) | 0–3ms | 590ms | ✅ |
| **VCP + volume dry-up composition** | EXPENSIVE + CHEAP | ~960ms total p95 | 540ms remaining | ✅ |
| Fundamentals (PE, PB, ROE, etc.) | FREE | 0–3ms each | 590ms | ✅ |

**No filter in this catalog, alone or in the described VCP compositions, pushes Nifty-500 p95 past 1,500ms.**
All-NSE VCP remains blocked until the all-NSE perf PR lands. All-NSE standalone volume dry-up is also deferred.

---

## Open questions requiring decision

### OQ1 — SMA vs EMA: expose both or pick one?

Minervini's published SEPA criteria (in *Trade Like a Stock Market Wizard*) use SMA 150 and SMA 200 for the trend template, not EMAs. Our current SEPA preset uses EMAs. Should we:
- (a) Expose both SMA and EMA position filters and let users choose
- (b) Silently align presets to use SMA (as Minervini describes) while EMA remains accessible
- (c) Keep EMA-only and document the deviation from Minervini's exact wording

*Recommendation: (a). SMA columns already exist. Add SMA filter fields in M3. Update the "SEPA" preset to use SMA 150/200 per Minervini's book.*

---

### Decision: Fundamental data freshness

Market cap and PE change daily (market_cap = close × shares_outstanding; PE = close / EPS). ROE/ROCE/PB change quarterly.

**Decision (not open):** Add market cap and PE daily refresh to the bhavcopy ingest. The bhavcopy already provides close; `shares_outstanding` and `eps` are already in `stock_universe`. This is a two-line ingest change and a prerequisite for fundamentals being non-misleading. Quarterly metrics (ROE, ROCE, debt_to_equity) can be refreshed from FMP weekly once OQ3 is approved. Until weekly refresh exists, show "as of YYYY-MM-DD" on any quarterly metric in the UI.

*Implementation: extend `services/bhavcopy.py` to update `market_cap_cr` and `pe_ratio` in `stock_universe` on each ingest run.*

---

### OQ3 — FMP as fundamental data source: approve?

FMP at $49/month (Starter tier) covers:
- ~3,000+ NSE symbols with quarterly income statement, balance sheet, cash flow
- Revenue/Profit growth, EPS (TTM and quarterly), EV/EBITDA
- Shareholding pattern (promoter %, FII %, DII %)
- 15,000 API calls/day — sufficient for weekly full-universe refresh

Alternative: BSE XBRL parsing (free, legally clean, 3–4 weeks engineering).

*Decision needed: approve FMP at $49/month? Or build XBRL parser?*

---

### OQ4 — Volume dry-up: M3 or post-M3?

Volume dry-up piggybacking on the VCP CTE is architecturally clean and within latency budget (combined p95 ~960ms). Without VCP, it's a standalone EXPENSIVE filter at ~450ms standalone — also within budget.

However, it adds fields to `ScanFilters`, Python logic to `vcp.py`, and test coverage.

*Recommendation: include in M3 as part of the VCP pass-2 enhancement. Low-risk, high value for Qullamaggie-style users.*

---

### OQ5 — Ingest sprint: N-day momentum and Supertrend

Filters #19 and #20 become FREE once precomputed columns exist. Both are computable from existing OHLCV data — no new external feed. They require:
- Schema migration (add 3–5 new columns to `daily_ohlcv`)
- Bhavcopy ingest update (compute at ingest time)
- `ScanFilters` fields + `_apply_filters` clauses

*Decision needed: include in M3 ingest sprint alongside the filter catalog implementation?*

---

### OQ6 — "RS Rating" naming — RESOLVED

**Decision (ADR 006 §Decision 5):** Ship as "RS Score". Field names: `rs_score_min` / `rs_score_max`. Column: `daily_ohlcv.rs_score`. The rename from `rs_rating` was applied in migration 033.

---

### Decision: Universe enforcement for all-NSE VCP scans

All-NSE VCP is 5,327ms p95 — 6.5% over the 5,000ms soft target (see `CLAUDE.md §8` and `docs/benchmarks/m3-phase1-baseline.md §All-NSE VCP: Open Performance Commitment`).

**Decision (not open):** Default universe = Nifty 500 for any scan that includes `vcp_contraction = true`. If a user selects "All NSE" + VCP, the API returns a hard error with message "VCP scan on All-NSE universe is not available — please select Nifty 500 or another filtered universe." No soft warning: a 5s scan that silently degrades UX is worse than a clear error. This enforcement is removed once the all-NSE perf PR lands and the p95 is confirmed below 5,000ms from Railway.
