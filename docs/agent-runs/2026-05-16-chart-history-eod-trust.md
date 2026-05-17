# Agent Run: Chart History + EOD Trust

Date: 2026-05-16
Branch: `codex/chart-history-eod-trust`
Mission Control issue: #106

## Agents

- Backend/Data Agent inspected chart candle endpoints, `daily_ohlcv` reads, EOD provenance, live provider metadata, and current historical-data limits.
- Frontend Agent inspected full chart and watchlist chart metadata surfaces and recommended compact header/chip placement instead of canvas clutter.
- QA Agent inspected backend, unit, and e2e coverage and identified missing structured coverage tests.

## Done

- Added structured `coverage` metadata to EOD and live candle responses: requested range, available range, returned bars, coverage percent, partial flag, partial reason, source, and as-of.
- Updated mock candle payloads to carry the same coverage shape.
- Updated Watchlist and Full Chart headers to show exact candle range, bar count, source, and as-of without adding chart-canvas clutter.
- Added partial-history copy that prefers backend coverage metadata when available.
- Fixed Text Note drawing creation so a simple click creates the editor, and armed tools take priority over selecting existing drawings.
- Preserved scanner-created watchlist focus by routing to `/watchlist?id=...&symbol=...`.

## Why

Traders were seeing only a few months of chart data for some symbols and could not tell whether that was a UI bug, a source problem, or true limited history. The platform now states the available candle range and whether history is partial, which improves trust without pretending data exists.

## Learned

- The backend already paginates deep EOD history correctly; the main gap was transparency when `daily_ohlcv` has partial symbol history.
- The frontend had good range heuristics, but no structured API metadata to distinguish shallow history from normal trading-day density.
- The chart Text Note tool had a real interaction issue: existing drawings could intercept clicks while another tool was armed.

## Improve Next

- Run the existing historical coverage audit against production data and publish a symbol-level readiness snapshot.
- Add a trader-facing “history depth” filter in Scanner so users can avoid names without enough chart history.
- Decide whether to backfill partial NSE symbols through the existing EOD ingestion path or keep them clearly labeled until a paid data source is approved.

## Validation

- `npm run lint`
- `npm run typecheck`
- `npm --prefix frontend run test -- tests/unit/watchlist-chart-range.test.ts tests/unit/candles-cache.test.ts tests/unit/mock-market-data.test.ts tests/unit/data-copy.test.ts tests/unit/mock-chart-persistence.test.ts`
- `backend/.venv/bin/python -m pytest backend/tests/test_charts.py backend/tests/test_market_context.py`
- `npm run test:e2e:layout`
- `npm run test:e2e:mock`
