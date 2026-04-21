# ADR 006 — M3 Filter Scope Decisions

> Status: **ACCEPTED**
>
> Records the five product and implementation decisions made after reviewing
> `docs/scan-filters-catalog.md`. These decisions bound the M3 sprint
> (M3-D through M3-F) and establish durable product principles.

---

## Context

The scan filters catalog (`docs/scan-filters-catalog.md`) was written to drive
M3 scope decisions after the VCP CTE fix (PR #14) established the performance
baseline: SEPA p50 = 154ms, VCP Nifty-500 p95 = 910ms. Five open questions
(OQ1, OQ3–OQ6) were left for product decision. This ADR records those decisions.

---

## Decision 1 — SMA for SEPA preset; EMA as custom option only (OQ1)

**Context:** Minervini's published SEPA methodology in *Trade Like a Stock Market
Wizard* specifies SMA 150 and SMA 200 for the trend template, not EMAs. The
alphavyuh SEPA preset has been using EMAs since M3-B, which is a documented
deviation. The target user (Minervini-style swing trader) will notice if the
default diverges from the methodology they're following.

**Decision:** Switch the SEPA preset to use SMA 150 and SMA 200 (from SMA 50,
150, 200 stack). EMA position filters remain available as custom options —
they appear in ScanFilters and can be used in user-composed scans — but the
out-of-the-box SEPA preset will use the methodology as published.

**Consequences:**
- The `sma_stack_bullish` field (M3-F) becomes the SEPA preset's core trend
  filter, replacing `all_emas_bullish`.
- `ScanFilters.all_emas_bullish` is NOT removed — it remains for users who
  prefer EMA-based trend filtering. It is de-emphasised in the preset UI.
- The SEPA preset name stays "SEPA" (not renamed to "Minervini SEPA") to avoid
  trademark/endorsement ambiguity.
- Existing saved scans that use `all_emas_bullish = true` continue to work.
  They will produce different results from the new SEPA preset — expected and
  acceptable; users composed them explicitly.

---

## Decision 2 — Fundamentals deferred to post-MVP; no FMP spend (OQ3)

**Context:** The filter catalog proposed Financial Modeling Prep (FMP) at
$49/month to provide revenue growth, profit growth, promoter holding, FII/DII,
and EV/EBITDA. These are "v1.5" features: valuable for power users but not part
of the core value proposition (scan → trade → journal loop) for MVP.

**Decision:** No external fundamentals data spend before MVP has paying users.
Fundamentals are deferred to post-MVP.

The fundamentals already in `stock_universe` (PE, PB, ROE, ROCE, market cap,
debt-to-equity, EPS, dividend yield) will be exposed in the scanner UI as-is,
with:
- Market cap and PE refreshed daily in bhavcopy ingest (trivial: market_cap =
  close × shares_outstanding; PE = close / EPS — both inputs already available).
- Quarterly metrics (ROE, ROCE, PB, D/E) shown with "as of [date]" label.
- No new external data source added in M3.

If fundamentals ship at all pre-MVP, they will use BSE XBRL filings (public,
no licensing cost). The XBRL parser is out of scope for M3.

**Consequences:**
- Revenue growth, profit growth, promoter/FII holding, EV/EBITDA: deferred.
  No ScanFilters fields, no migrations, no ingest pipeline in M3.
- FMP API integration is not started. No API keys purchased.
- The `CLAUDE.md §8 Known gaps` entry tracks this commitment.

---

## Decision 3 — Volume dry-up as VCP composition only; no standalone (OQ4)

**Context:** Volume dry-up (most recent N sessions at ≤ 60% of 50-day average
volume) is CHEAP when combined with VCP (shared 75-day CTE data) but EXPENSIVE
standalone (~600–900ms for a 500-candidate Nifty-500 pass-1, and deferred
entirely for all-NSE).

**Decision:** Volume dry-up ships as a VCP composition rule only. It is **not**
exposed as a standalone scan filter in M3.

**Product principle (added to CLAUDE.md §5):** Prefer filter composition over
pre-built combinations. If a requested filter is equivalent to composing 2–3
existing FREE/CHEAP filters, default to composition and expose it as a preset
rather than a new standalone filter type. This avoids combinatorial explosion
in the filter DSL and keeps the latency budget predictable.

Applied here: standalone volume dry-up is functionally equivalent to composing
`volume_ratio_max` (recent sessions below average) + `vcp_contraction`. The
standalone filter adds a named concept without new information.

**Consequences:**
- `volume_dryup` field added to `ScanFilters` in M3-F, but the field is only
  active when `vcp_contraction = true`. If a user sets `volume_dryup = true`
  without VCP, the API returns a validation error: "volume_dryup requires
  vcp_contraction = true — consider composing volume_ratio_max with your scan."
- Estimated combined latency (VCP + volume dry-up): ~960ms p95. ✅
- Post-MVP: revisit standalone once all-NSE VCP perf is resolved.

---

## Decision 4 — Ingest sprint: momentum_5d/10d/20d + supertrend_direction + prev_macd_hist (OQ5)

**Context:** N-day momentum and Supertrend are NEW DATA filters that become FREE
once precomputed columns exist. Both are computable entirely from existing OHLCV
data — no external feed required.

**Decision:** Yes to the ingest sprint. The following columns are added to
`daily_ohlcv` in M3-E:

| Column | Type | Definition |
|--------|------|-----------|
| `momentum_5d` | numeric | `(close_today − close_5d_ago) / close_5d_ago × 100` |
| `momentum_10d` | numeric | Same, 10-session window |
| `momentum_20d` | numeric | Same, 20-session window |
| `supertrend_direction` | smallint | 1 = bullish, -1 = bearish, 0 = insufficient data |
| `prev_macd_hist` | numeric | Previous session's `macd_hist` value (needed for MACD cross detection) |

Scope is tight — only these five columns. No broader ingest overhaul.

**Supertrend parameters:** Supertrend(10, 3) — 10-period ATR with multiplier 3.
These are the widely-used Indian retail defaults (Chartink's default is also
10, 3). Explicit formula with band-locking: see `docs/scan-filters-catalog.md #20`.

**Backfill:** One-shot `backend/scripts/backfill_momentum_supertrend.py` that:
- Processes in symbol-batch chunks (idempotent, can resume from last processed symbol)
- Logs progress and estimated time remaining
- Updates only `NULL` rows (safe to re-run)
- Target: staging validates before production is touched

**Split adjustment — closed question:** NSE CM bhavcopy `close` is the actual
traded price on each day, NOT adjusted for corporate actions (splits, bonuses,
rights). Momentum across a corporate action date will show a large artifact
(e.g. a 2:1 split produces an apparent −50% move in `momentum_5d`). This is a
**known limitation** at M3, accepted under the following conditions:

1. The scanner UI shows a disclosure below momentum filters: "Momentum values
   may be distorted for stocks with recent splits or bonus issues."
2. The backfill script flags symbols where a >40% single-day price drop appears
   in the history and logs them — does NOT skip them, but the log gives ops
   visibility for manual review.
3. A corporate actions adjustment pipeline (adjusted close column) is explicitly
   out of M3 scope. It can be addressed post-MVP if user complaints warrant it.

**Consequences:**
- Filters `pct_change_5d_min`, `pct_change_10d_min`, `pct_change_20d_min`,
  `supertrend_signal` added to `ScanFilters` in M3-F (FREE, push-filterable).
- MACD cross variants (`bullish_cross`, `bearish_cross`) become safe once
  `prev_macd_hist` is confirmed present — unblock the CHEAP→FREE reclassification.
- Schema migration (M3-E) must not break any existing query. The new columns
  are nullable; existing code that doesn't select them is unaffected.
- Momentum artifacts on split dates are a known limitation, disclosed in UI,
  and logged by the backfill script (see split adjustment section above).

---

## Decision 5 — RS score name: "RS Score" (not "RS Rating") (OQ6)

**Context:** The term "RS Rating" is associated with Investor's Business Daily
(IBD). Shipping under that name — even with a disclaimer tooltip — documents
awareness of the association while retaining the conflatable term, which is a
weaker legal position than simply not using it. The feature itself (12-month
price performance percentile rank vs the NSE universe) is the same.

**Decision:** Ship as **"RS Score"** in the UI and API. The field names in
`ScanFilters` are `rs_score_min` / `rs_score_max` (not `rs_rating_min/max`).

Tooltip text (non-dismissable info icon on the filter control):

> "12-month price change relative to the NSE universe, percentile-ranked.
> Score of 90 means this stock outperformed 90% of NSE stocks over 12 months."

The phrase "Not IBD's RS Rating" is deliberately omitted from the tooltip — it
draws the comparison rather than avoiding it. The name "RS Score" is
sufficiently distinct and descriptive on its own.

This is the alpha-version. Before public launch, the scoring formula should be
calibrated to ensure the distribution of scores across the universe matches user
expectations (e.g., whether 70+ actually corresponds to Minervini's threshold
of selecting the top quartile).

**Acceptance criteria for calibration (required before public launch):**
- Run RS Score across all NSE EQ symbols for the past 12 months
- Verify score distribution is roughly uniform (each decile ≈ 10% of symbols)
- Verify that symbols with score ≥ 70 overlap ≥ 80% with Minervini's "top
  quartile RS" stocks as described in *Trade Like a Stock Market Wizard*
- Document calibration run results in `docs/benchmarks/rs-score-calibration.md`

**Consequences:**
- API field names: `rs_score_min`, `rs_score_max` (breaking change if any
  external consumers exist; confirmed none at M3 time).
- The scanner UI must include the tooltip above on the RS Score filter control.
- Pre-launch task: calibration sprint as specified above. Tracked in
  `CLAUDE.md §8 Known gaps`.

---

## Latency budget after M3-F

The **910ms p95 VCP Nifty-500 benchmark is end-to-end** — it includes SEPA
pass-1 (154ms) and VCP pass-2 (CTE) in a single measurement. The Python
post-processing filters (volume dry-up, momentum, etc.) add incremental cost
on top of the 910ms baseline.

Worst-case Nifty-500 composition (VCP + volume dry-up + momentum + any 3 FREE
filters), post M3-F:

| Layer | What it adds | Cumulative p95 |
|-------|-------------|----------------|
| SEPA pass-1 + VCP pass-2 (all-in benchmark) | full CTE round-trip | ~910ms |
| Volume dry-up (shared CTE data, Python) | +~50ms | ~960ms |
| Consecutive up/down closes (shared CTE data, Python) | +~10ms | ~970ms |
| N-day momentum (precomputed column, WHERE clause) | 0ms (push-filter) | ~970ms |
| Supertrend (precomputed column, WHERE clause) | 0ms (push-filter) | ~970ms |
| MACD cross (precomputed prev_macd_hist, Python) | +~5ms | ~975ms |

**~975ms p95 worst-case composition — 35% headroom vs 1,500ms target.**

All-NSE VCP remains blocked; that headroom does not apply to all-NSE.

---

## Links

- Filter catalog: `docs/scan-filters-catalog.md`
- Scan engine architecture: `docs/decisions/005-scan-engine.md`
- Performance baseline: `docs/benchmarks/m3-phase1-baseline.md`
- M3-E migration: `supabase/migrations/031_daily_ohlcv_m3_columns.sql` (to be created)
- M3-E backfill script: `backend/scripts/backfill_momentum_supertrend.py` (to be created)
