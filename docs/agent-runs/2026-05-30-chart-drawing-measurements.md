# Chart Drawing Measurement Slice

Issue: #282
Branch: `codex/issue-282-chart-tools`

## Scope

- Added selected-drawing measurements on the full chart context bar.
- Trendlines/rays show price move, percent move, and calendar span.
- Horizontal levels show distance from the latest displayed close.
- Rectangles show zone low/high, zone height percent, and span.
- Long/short position drawings show entry, stop, target, risk, reward, and R:R.

## Verification

- Unit coverage: `frontend/tests/unit/chart-drawing-measure.test.ts`
- Mock workflow coverage: rectangle zone drawings now assert visible measurement before creating a zone note.

## Notes

- This is a focused #282 chart ergonomics slice.
- No TradingView Advanced Charts code, broker order behavior, production data mutation, or schema migration was added.
