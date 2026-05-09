# Trader Usefulness Report — 2026-05-09

## Scope

Focused pass for five improvements that should help real beta traders move from scan to decision without adding screen clutter:

1. Bounded scanner intelligence backfill
2. Scanner “why this stock” scoring
3. Chart-to-plan handoff confirmation
4. Plain-language data confidence labels
5. Beta funnel telemetry
6. Latency reduction

## What changed and why it helps

### Bounded historical scanner backfill

Added `backend/scripts/backfill_scanner_intelligence.py` and shared calculations in `backend/app/services/scanner_intelligence.py`.

User impact: scanners can rely on the same computed fields across dates, including EMA 150, EMA 200 slope, 50-day average volume, 6-month performance, 3-week box range, box height, and NR7. This improves trust because results are not silently weaker when fields are missing.

Space cost: none in the UI. This is an operator/data reliability improvement.

### Why-this-stock scoring

Scanner results now include `setup_score`, `setup_grade`, `confidence_label`, and compact confidence reasons.

User impact: traders can quickly prioritize the strongest setups instead of reading every metric row by row. The score does not replace judgment; it explains why a match may deserve review.

Space cost: one compact pill in the existing expanded row area. No extra table column was added, to keep scan density.

### Chart-to-plan handoff confirmation

Full chart risk/reward drawings now open a compact confirmation before sending levels to the Watchlist Decision Desk.

User impact: prevents accidental plan transfer and lets the trader verify entry, stop, target, side, and R:R before the Decision Desk is populated.

Space cost: zero by default. The confirmation appears only after the trader clicks “Send to desk.”

### Plain-language data confidence labels

Data provenance badges now use trader-facing labels such as “Data ready,” “Check data,” and “Demo data” instead of provider-oriented labels.

User impact: traders know whether the data is usable without reading backend/provider jargon.

Space cost: unchanged badge footprint.

### Beta funnel telemetry

Added more precise funnel events around scanner confidence availability, watchlist symbol focus, and chart plan handoff preview/confirmation.

User impact: no screen impact. Product decisions can be based on whether traders actually complete scanner → watchlist → chart → plan → journal instead of guessing.

Space cost: none.

### Latency reduction

Reduced avoidable background work and added safe prefetch paths:

- Live quote polling is now opt-in via `NEXT_PUBLIC_ENABLE_LIVE_QUOTES=true`, so completed-market beta mode does not spend page-load time polling live endpoints that are not needed.
- Workflow-state reads are cached/coalesced briefly, then invalidated after writes.
- Indicator reads are cached/coalesced like candles.
- Watchlist and Full Chart prefetch adjacent symbol candles after the current chart is usable, making Prev/Next chart review feel faster without blocking first paint.
- Watchlist enriched quote hydration is deferred to browser idle time after the lite queue renders.

User impact: the first usable trading surface gets less network competition, chart navigation feels warmer, and repeated indicator toggles/symbol changes reuse existing data instead of refetching.

Space cost: none. These are data-path and scheduling changes.

## Expected impact

- Faster scanner triage: setup score highlights which results to open first.
- Fewer chart-to-plan mistakes: confirmation reduces accidental Decision Desk updates.
- Better data reliability: bounded backfill makes scanner intelligence repeatable and auditable.
- Cleaner trust language: users see confidence state without technical terms.
- Better beta learning: telemetry shows where traders drop off.
- Lower perceived latency: the app avoids nonessential live polling and warms likely next chart data.

## Risks and guardrails

- Setup score is not investment advice. It is only a prioritization aid based on visible scanner metrics.
- Backfill script requires service-role credentials and should be run with `--dry-run` first.
- No production Supabase changes were performed by this pass.
- No broker execution, billing, auth, charting-library, or Supabase schema behavior was changed.
- Live polling remains available by setting `NEXT_PUBLIC_ENABLE_LIVE_QUOTES=true` when a real live provider path is ready.
