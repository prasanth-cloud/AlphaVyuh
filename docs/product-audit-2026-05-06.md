# AlphaVyuh Product Audit - 2026-05-06

Scope: authenticated mock workflow after PR #57 merge.

## Dashboard
- User intent: understand market health, broker/data state, and the next workflow action.
- Current friction: onboarding checklist and action cards compressed badly on mobile; broker step reads as incomplete in mock mode even though import is available.
- Visual issues: desktop hierarchy is strong; mobile grid needed single-column collapse.
- Reliability issues: none observed in mock audit.
- Speed/data issues: local mock page usable in about 0.8s during screenshot audit.
- Missing trust signals: data and broker state are visible; review coverage is visible.
- Highest-impact fix: make dashboard grids responsive without changing desktop workflow density. Priority: P1.

## Scanner
- User intent: generate ideas, mark lifecycle, and send candidates to a watchlist.
- Current friction: row actions are dense, but still discoverable and keyboard/test flow works.
- Visual issues: action cluster is crowded on desktop; no horizontal overflow observed.
- Reliability issues: scanner to watchlist handoff remains the critical path to protect.
- Speed/data issues: mock audit rendered in under 0.8s.
- Missing trust signals: EOD badge is visible; data-health detail remains secondary.
- Highest-impact fix: keep row actions stable and avoid broad redesign this pass. Priority: P2.

## Watchlist
- User intent: work an active queue, inspect chart context, fill a valid plan, and draft an order.
- Current friction: dense but usable; Decision Desk clearly blocks invalid orders.
- Visual issues: desktop/tablet header wrap passed audit; chart stays dominant.
- Reliability issues: selected symbol, query state, chart and desk sync remain critical.
- Speed/data issues: chart and fundamentals load without blocking the desk in mock mode.
- Missing trust signals: broker/order route state is now visible in the order panel.
- Highest-impact fix: preserve Prev/Next and order gating; add no churn unless sync breaks. Priority: P1.

## Full Chart
- User intent: serious chart review, drawing, plan transfer, alerts, and journal/order context.
- Current friction: stale-data banner used backend jargon; mock route `/charts/AUBANK` showed Reliance context before this pass.
- Visual issues: toolbar is dense but not overflowing at audited widths.
- Reliability issues: symbol/company/price mismatch is a trust-breaking P0.
- Speed/data issues: local mock chart rendered in about 1.0s.
- Missing trust signals: symbol, timeframe, EOD/live badge, stale banner and object count are visible.
- Highest-impact fix: keep mock chart identity aligned for route symbols and replace jargon in stale-data copy. Priority: P0/P1.

## Journal
- User intent: review trades, import broker fills, close trades, and learn from outcomes.
- Current friction: imported trade dedupe state is not prominent until after import, but status bar shows sync state.
- Visual issues: table density is good on desktop; no overflow observed.
- Reliability issues: AI/coaching must fail soft; no console errors observed.
- Speed/data issues: local mock journal rendered in about 0.65s.
- Missing trust signals: broker status and last sync are visible.
- Highest-impact fix: keep import status cache invalidation from PR #57; strengthen no-console tests later. Priority: P1.

## Settings/Broker
- User intent: understand current broker mode, run read-only smoke, import fills, and avoid unsafe live actions.
- Current friction: disabled connect buttons can look like a blocked primary path in mock mode.
- Visual issues: mobile broker cards are tight but no page overflow.
- Reliability issues: token/secrets stay server-side; read-only smoke is sanitized.
- Speed/data issues: local mock rendered in about 0.7s.
- Missing trust signals: states now cover not connected, read-only, token expiry, import readiness and last sync.
- Highest-impact fix: preserve safe read-only/mock path; defer real token smoke until owner-provided credentials. Priority: P1.

## Data Status
- User intent: decide if market, broker, and journal data can be trusted before acting.
- Current friction: copy is clear, but mobile product-surface cards are tall.
- Visual issues: no light-theme leakage; mobile card text can feel cramped.
- Reliability issues: page fails soft with unavailable health state.
- Speed/data issues: mock desktop audit was the slowest page at about 1.4s, still usable.
- Missing trust signals: market data, coverage, broker, live-feed token and workflow status are explicit.
- Highest-impact fix: leave structure intact; improve mobile card density in a later pass if needed. Priority: P2.

## Implemented In This Pass
- Fixed mock `AUBANK` chart identity so route symbol, company name, and candles match.
- Added deterministic fallback mock quotes for unknown symbols instead of silently using Reliance.
- Replaced full-chart stale-data jargon with trader-facing copy.
- Made dashboard checklist, action, stats and main grids responsive on tablet/mobile.
- Locked authenticated routes to the dark trading desk theme at SSR and on client route changes.
- Extended layout smoke coverage to include a mobile viewport.
