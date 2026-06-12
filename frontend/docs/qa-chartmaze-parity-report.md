# QA Report — Scanner Chartmaze Parity

**Branch:** `feat/scanner-chartmaze-parity`  
**Date:** 2026-06-11

## Coverage

| Surface | Flow | Status |
|---------|------|--------|
| Scanner charts view | 2-up / 4-up grid, MiniChart tiles, RS badge, Shortlist, tile → chart | Pass (mock) |
| Scanner list view | TV table, RS + % from 52W high + sector columns, pagination footer | Pass (mock) |
| Scanner toolbar | List/Charts chips, symbol filter, Copy TV, Export CSV | Pass (mock) |
| Filter panel | Technicals / Fundamentals top tabs, More screeners catalog | Pass (mock) |

## P0–P3 deliverables

- **P0:** Real candlestick grid in Charts view with prefetch, EMA 20/50 + volume, review board link
- **P1:** TV-style list defaults (RS, 52W high %, sector), stronger pagination contrast
- **P2:** Scanner chart tile surfaces, brighter ticker/price text, stronger active chips and table headers
- **P3:** Top filter tabs, in-results symbol filter, CSV export + visible Copy TV, expandable screener catalog

## Verification

```text
npm run typecheck          → pass
npm run lint               → pass
npm run test -- scanner-result-columns → 2 passed
npm run e2e:scanner-tv     → 3 passed
npm run e2e:mock           → 17 passed
npm run e2e:layout         → 16 passed
npm run e2e:qa-video       → 1 passed (video recorded)
```

## Notes

- Chart tiles show unavailable copy when candle API fails (trust invariant preserved).
- Symbol filter is client-side on the current results page only.
