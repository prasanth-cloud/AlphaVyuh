# AlphaVyuh Execution Roadmap

This roadmap is the practical path to make AlphaVyuh a category-defining product for systematic traders.

Core principle:

`scan -> shortlist -> chart -> execute -> auto-journal -> review`

The product wins if this loop is faster, cleaner, and more useful than stitching together multiple tools.

## 2026-06-18 Sequencing And Safety Update

ADR 013 remains authoritative: the journal feedback loop is the product wedge.
Scanner work is limited to trust, correctness, and measured performance. Live
broker execution remains owner-gated; until sandbox validation, idempotency,
reconciliation, and legal review are complete, chart/watchlist actions create
order drafts and journal context rather than sending real orders.

Performance work follows this order:

1. Measure browser, API, database, and compute time separately.
2. Remove duplicate work with caching, precomputation, and narrower queries.
3. Establish separately labelled p50/p95 production baselines for cold start,
   helper-warm/result-cache-bypassed, and result-cache-hit paths.
4. Profile CPU-heavy kernels with representative NSE data.
5. Consider Rust/C++ only when profiling proves CPU time is the dominant
   remaining bottleneck and the boundary can be isolated behind tests.

The target is a measured 2x improvement on named flows, not an unsupported
"100% faster" claim across the entire website.

## Product Goal

Build the best end-to-end workflow for NSE/BSE systematic traders:

- find setups quickly
- manage a focused watchlist
- analyze and execute from the chart
- capture every trade automatically
- improve through post-trade review

## Phase 1: Command Center

Objective:
Make watchlist and chart interaction so good that users naturally stay inside AlphaVyuh during live decision-making.

### Features

- multi-watchlist workflow
- pinned symbols and symbol tags
- saved row-sort presets
- compact and dense watchlist modes
- stronger selected-symbol context
- faster scanner-to-watchlist handoff
- faster watchlist-to-chart handoff
- cleaner chart preview actions
- watchlist symbol notes and setup notes

### Frontend Ownership

- `frontend/app/(app)/watchlist/page.tsx`
- `frontend/components/charts/MiniChart.tsx`
- `frontend/components/charts/SymbolSearch.tsx`
- `frontend/lib/api.ts`

### Backend Ownership

- `backend/app/routers/watchlist.py`
- `backend/app/routers/scanner.py`

### Implementation Order

1. Add watchlist metadata model support:
   - tags
   - pinned state
   - notes
2. Add multi-watchlist UX and saved sorting/grouping behavior
3. Add explicit scanner row actions:
   - add to watchlist
   - open chart
4. Improve watchlist row density and active-symbol focus panel
5. Add quick symbol note and setup note storage

### Success Criteria

- user can move from scan result to chart in one click
- user can maintain more than one watchlist without friction
- watchlist feels like the real home screen, not a staging page

## Phase 2: Chart Execution Surface

Objective:
Make the chart good enough for serious daily usage.

### Features

- stronger crosshair and OHLC readout
- cleaner price-scale and time-scale polish
- draggable stop-loss and target lines
- open-position overlays
- partial exit flows
- modify/cancel order actions
- chart templates and saved layouts
- higher-quality drawing interaction
- keyboard shortcuts

### Frontend Ownership

- `frontend/app/(app)/charts/[symbol]/page.tsx`
- `frontend/components/charts/CandlestickChart.tsx`
- `frontend/components/charts/OrderModal.tsx`
- `frontend/components/charts/IndicatorPanel.tsx`
- `frontend/lib/api.ts`

### Backend Ownership

- `backend/app/routers/charts.py`
- `backend/app/routers/broker.py`
- `backend/app/routers/brokers.py`
- `backend/app/brokers/kite/adapter.py`
- `backend/app/brokers/mock/adapter.py`

### Implementation Order

1. Add position overlay model to chart page
2. Add stop/target line rendering and drag handlers
3. Add sandbox-only modify/cancel flows behind explicit confirmation and
   idempotency keys
4. Add sandbox-only partial exit support after reconciliation tests pass
5. Improve chart interaction polish:
   - hit targets
   - snap behavior
   - readout density
6. Add saved chart layouts/templates

### Success Criteria

- user can manage an open trade from the chart directly
- chart no longer feels like a supporting page
- execution state is obvious and trustworthy

## Phase 3: Journal Moat

Objective:
Turn the journal into the reason traders stay and pay.

### Features

- weekly AI review summary
- setup-wise performance breakdown
- mistake clustering
- adherence scoring
- repeated mistake detection
- review history over time
- best setup / worst setup reports
- symbol-level edge breakdown
- trade quality scoring

### Frontend Ownership

- `frontend/app/(app)/journal/page.tsx`
- `frontend/app/(app)/journal/components/JournalAiInsights.tsx`
- `frontend/app/(app)/journal/components/JournalAnalytics.tsx`
- `frontend/app/(app)/journal/components/JournalStatusBar.tsx`
- `frontend/app/(app)/journal/components/TradePanel.tsx`
- `frontend/app/(app)/journal/components/TradeTable.tsx`
- `frontend/app/(app)/journal/components/utils.ts`

### Backend Ownership

- `backend/app/routers/journal.py`
- `backend/app/routers/ai.py`

### Implementation Order

1. Normalize trade metadata:
   - setup
   - entry reason
   - exit reason
   - rule adherence fields
2. Add weekly review summary generation
3. Add mistake clustering and repeated-pattern detection
4. Add setup-level and symbol-level analytics surfaces
5. Add review history snapshots

### Success Criteria

- user gets meaningful review value after 10-20 trades
- weekly review becomes part of the product habit
- journal feels like coaching, not storage

## Phase 4: Scanner Trust

Objective:
Make scanner the tool users start with every day.

### Features

- saved scans
- "why this matched" explanations
- better result ranking
- market regime filters
- sector/industry context
- confidence score
- scan result pagination/performance polish

### Frontend Ownership

- `frontend/app/(app)/scanner/page.tsx`
- `frontend/components/scanner/StockDetailPanel.tsx`
- `frontend/components/scanner/EmaTag.tsx`
- `frontend/components/scanner/PctChange.tsx`
- `frontend/components/scanner/RsiBadge.tsx`
- `frontend/lib/api.ts`

### Backend Ownership

- `backend/app/routers/scanner.py`
- `backend/app/scanners/vcp.py`
- `backend/app/services/indicators.py`
- `backend/app/routers/market.py`
- `backend/app/routers/stocks.py`

### Implementation Order

1. Add saved scan UX cleanup and make it central
2. Add match explanation payload per stock
3. Tune existing preset ranking using scanner-to-journal outcome evidence
4. Add regime + sector context
5. Tune result paging and query responsiveness

### Success Criteria

- users trust why symbols appear
- scanner output feels actionable, not noisy
- daily session starts from AlphaVyuh

## Phase 5: Broker Reliability

Objective:
Make execution trustworthy enough for serious usage.

### Features

- richer order state sync
- activity log
- explicit broker error handling
- retries and stale-state handling
- better position reconciliation
- broker settings health checks

### Frontend Ownership

- `frontend/app/(app)/settings/broker/page.tsx`
- `frontend/app/(app)/broker/callback/page.tsx`
- `frontend/app/(app)/charts/[symbol]/page.tsx`
- `frontend/components/charts/OrderModal.tsx`

### Backend Ownership

- `backend/app/routers/broker.py`
- `backend/app/routers/brokers.py`
- `backend/app/brokers/factory.py`
- `backend/app/brokers/credentials.py`
- `backend/app/brokers/kite/api.py`
- `backend/app/brokers/kite/adapter.py`

### Implementation Order

1. Add unified broker order status model
2. Add a unique order-intent key spanning chart/watchlist, broker submission,
   broker-order log, workflow state, and journal entry
3. Add clear broker activity timeline
4. Add explicit retry/failure and partial-fill states
5. Add position reconciliation pass
6. Add broker health diagnostics in settings

Current lifecycle invariant: broker submission is not a fill. Pending or open
orders with zero filled quantity remain in the triggered workflow state and do
not create an open Journal position. Partial/complete fills use broker-reported
quantity and average price.

Database concurrency invariant: migration
`20260619004532_atomic_order_intent_reservation.sql` enforces one broker-order
row and one Journal position per user order intent. It must be applied and
verified in staging before sandbox execution tests.

Trader visibility invariant: Broker settings includes a lifecycle timeline.
Pending orders remain visibly unfilled, can be reconciled through the broker,
and only expose a Journal link after a fill-backed entry exists.

Cockpit visibility invariant: the default Session dashboard surfaces broker
exceptions in a compact flight-status module. Fill-to-Journal gaps outrank
pending/partial orders, and unavailable activity never appears healthy.

### Success Criteria

- failed broker actions are understandable
- open positions and orders stay consistent
- trust does not collapse around execution

## Phase 6: Platform Polish

Objective:
Make AlphaVyuh feel premium and effortless.

### Features

- stronger visual consistency
- consistent loading and empty states
- onboarding checklist
- dashboard tied to real workflow
- cleaner notifications
- better perceived performance
- stronger mobile responsiveness on key routes

### Frontend Ownership

- `frontend/app/(app)/dashboard/page.tsx`
- `frontend/components/AppShell.tsx`
- `frontend/app/globals.css`
- shared UI components under `frontend/components`

### Backend Ownership

- `backend/app/routers/data_health.py`
- `backend/app/routers/users.py`

### Implementation Order

1. Improve dashboard around real workflow status
2. Add onboarding checklist tied to actual state
3. Normalize loading/empty states
4. Improve status messaging and error handling
5. Performance cleanup on high-traffic pages

### Success Criteria

- product feels expensive
- first-use experience is clear
- users know what to do next without guessing

## Recommended Sprint Plan

## Sprint 1

Ship the highest-ROI workflow improvements.

- watchlist command center improvements
- scanner-to-watchlist handoff
- watchlist-to-chart handoff
- auto-journal metadata cleanup
- first chart-side position controls

Primary files:

- `frontend/app/(app)/watchlist/page.tsx`
- `frontend/app/(app)/scanner/page.tsx`
- `frontend/app/(app)/charts/[symbol]/page.tsx`
- `frontend/lib/api.ts`
- `backend/app/routers/watchlist.py`
- `backend/app/routers/broker.py`
- `backend/app/routers/journal.py`

## Sprint 2

- draggable stop/target lines
- chart order management polish
- partial exits and order modification
- saved chart layouts
- broker activity timeline

Primary files:

- `frontend/components/charts/CandlestickChart.tsx`
- `frontend/components/charts/OrderModal.tsx`
- `frontend/app/(app)/charts/[symbol]/page.tsx`
- `backend/app/routers/charts.py`
- `backend/app/routers/broker.py`
- `backend/app/brokers/kite/adapter.py`

## Sprint 3

- weekly AI review summary
- adherence scoring
- repeated mistake detection
- setup-level journal analytics

Primary files:

- `frontend/app/(app)/journal/page.tsx`
- `frontend/app/(app)/journal/components/*`
- `backend/app/routers/journal.py`
- `backend/app/routers/ai.py`

## Sprint 4

- saved scan polish
- explanation engine
- better scanner ranking
- sector/regime overlays

Primary files:

- `frontend/app/(app)/scanner/page.tsx`
- `frontend/components/scanner/*`
- `backend/app/routers/scanner.py`
- `backend/app/scanners/vcp.py`

## Priority Rules

When choosing what to build next, use this order:

1. anything that improves the full trade loop
2. anything that improves trust in execution
3. anything that creates unique post-trade value
4. only then add wider feature breadth

Avoid:

- adding disconnected features
- dashboard-only work before workflow quality is strong
- cosmetic polish that does not improve usability
- broad broker expansion before current broker reliability is strong

## Best Immediate Next Step

Start with:

- `watchlist/page.tsx`
- `charts/[symbol]/page.tsx`
- `routers/watchlist.py`
- `routers/broker.py`
- `routers/journal.py`

Reason:

This slice improves the core product loop directly and moves AlphaVyuh closer to being the default daily workspace for a serious trader.
