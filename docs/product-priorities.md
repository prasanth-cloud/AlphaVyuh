# AlphaVyuh Product Priorities

**Status:** Working plan  
**Date:** 2026-04-25  
**Scope:** Product improvements that make AlphaVyuh more trustworthy, useful, and easier to ship.

## Product Wedge

AlphaVyuh should win by owning one disciplined trader loop:

1. Scan the EOD universe for SEPA, VCP, breakout, and strong-trend candidates.
2. Shortlist names into focused watchlists.
3. Review chart context, RS, volume, and pivot zones.
4. Write the trade plan before entry: setup, entry, invalidation, risk, and expected behavior.
5. Journal the result and use AI only when it cites the actual trades behind its feedback.

Do not dilute this with broad dashboard features until this loop is fast, credible, and easy to repeat.

## Priorities

### 1. Data Trust

Every market surface must say what the user is seeing:

- `yahoo`: current provider response
- `cache`: previously fetched data
- `mock`: demo fallback
- future live feeds: source, delay, and `asOf` timestamp

Demo data may animate for polish, but real or cached data must not be randomly mutated in the client.

### 2. Chart Decision

ADR 009 should be resolved before investing in custom drawing tools. The preferred path is TradingView Advanced Charts if the license explicitly permits AlphaVyuh's subscription-gated SaaS model.

Do not build a partial drawing system that lacks Fibonacci, text annotation, snapping, persistence, and undo.

### 3. Watchlist Workspace

The next product-critical authenticated screen is the watchlist/chart workspace:

- dense symbol table
- selected-symbol chart
- RS and setup metadata
- trade-plan panel
- journal handoff
- visible data provenance

This screen should feel operational, not like a landing page.

### 4. Broker Safety

Broker import and execution should graduate in stages:

1. manual journal logging
2. broker trade import
3. paper/sandbox order preview
4. live execution after reconciliation and risk controls

Until then, broker execution should be labeled beta in public copy.

### 5. Grounded AI

AI feedback is useful only if it is traceable. Each generated insight should include:

- the trades used
- the rule or behavior detected
- supporting stats
- a suggested rule change

Avoid generic coaching copy.

## Next Engineering Moves

1. Merge the public landing page after the data-trust copy and demo-animation fixes are reviewed.
2. Merge ADR 009 after TradingView licensing is confirmed or explicitly mark it blocked.
3. Resolve the authenticated-screen design conflicts in PR 21.
4. Resolve the scanner/ingest conflicts in PR 17 and rerun backend tests before staging migration.
5. Build the watchlist/chart workspace around the five-step trader loop above.

