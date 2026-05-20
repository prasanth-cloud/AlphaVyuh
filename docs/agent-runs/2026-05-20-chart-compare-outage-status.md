# Chart Compare Outage Status

## Goal

Make full-chart symbol comparison honest when the base candle chart is usable but
the comparison symbol cannot load.

## Changes

| Area | Change | Product impact |
| --- | --- | --- |
| Full chart compare loader | Tracks compare-symbol failures separately from base candle failures and preserves backend detail. | A failed comparison no longer looks like a successful `vs SYMBOL` state with a missing overlay. |
| Chart UI | Shows a `Compare unavailable` toolbar chip and an inline retry banner while keeping the base chart available. | Traders can continue chart review, drawing, alerts, and order planning without misreading absent compare data. |
| Regression coverage | Added forced-live Playwright coverage for healthy base candles plus failed compare candles. | Future chart changes should not reintroduce silent compare-line failures. |

## Validation

- PASS `PLAYWRIGHT_MOCK_AUTH=true NEXT_PUBLIC_DATA_MODE=mock NEXT_PUBLIC_FORCE_LIVE_DATA=true NEXT_PUBLIC_ALLOW_MOCK_FALLBACK=false npm --prefix frontend exec -- playwright test --config=frontend/playwright.config.ts frontend/tests/e2e/chart-unavailable.spec.ts`
- PASS `npm --prefix frontend run typecheck`
- PASS `npm --prefix frontend run lint`
- PASS `npm --prefix frontend run test`
- PASS `npm run test:production-api-check`
- PASS `npm run test:production-smoke-env-check`
- PASS `git diff --check`
- PASS `npm --prefix frontend run e2e:mock`
- INFO First focused Playwright rerun after the selector fix briefly hit `ERR_CONNECTION_REFUSED` before the dev server restarted; a clean rerun passed all 3 chart-unavailable tests.
- PASS Browser smoke on `http://localhost:3000/charts/AUBANK?full=1` with mock auth/data: chart drawing overlay visible, one Compare button visible, one Tools button visible, and AUBANK context present.

## Recovery Status

This improves chart reliability during partial comparison-data outages. It does
not recover production data. Railway/backend recovery still requires restored
Railway auth or GitHub recovery secrets, followed by `npm run check:data-recovery`.
