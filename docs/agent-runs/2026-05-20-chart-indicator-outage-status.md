# Chart Indicator Outage Status

## Goal

Keep full-chart analysis honest when candle data loads but the indicator service
is unavailable. Traders should not see selected indicators silently disappear.

## Changes

| Area | Change | Product impact |
| --- | --- | --- |
| Chart API client | `getIndicators` now preserves backend outage detail on failed HTTP responses. | The UI can show the actual indicator-service failure instead of a generic fetch failure. |
| Full chart | Indicator loading failures set a dedicated degraded state instead of blocking candles. | Candles, drawings, alerts, and order planning remain usable while the chart clearly says indicators are unavailable. |
| Regression coverage | Added a forced-live Playwright case for healthy candles plus failed indicators, and unit coverage for failed indicator response detail. | Future chart work should not regress into silently missing EMA/MACD/overlay context. |

## Validation

- PASS `npm --prefix frontend run test -- --run tests/unit/candles-cache.test.ts`
- PASS `PLAYWRIGHT_MOCK_AUTH=true NEXT_PUBLIC_DATA_MODE=mock NEXT_PUBLIC_FORCE_LIVE_DATA=true NEXT_PUBLIC_ALLOW_MOCK_FALLBACK=false npm --prefix frontend exec -- playwright test --config=frontend/playwright.config.ts frontend/tests/e2e/chart-unavailable.spec.ts`
- PASS `npm --prefix frontend run lint`
- PASS `npm --prefix frontend run typecheck`
- PASS `npm --prefix frontend run test`
- PASS `npm run test:production-api-check`
- PASS `npm run test:production-smoke-env-check`
- PASS `git diff --check`
- PASS `npm --prefix frontend exec -- playwright test --config=frontend/playwright.mock.config.ts frontend/tests/e2e/workflow-mock.spec.ts --grep "signup first-run"`
- PASS `npm --prefix frontend run e2e:mock`
- INFO A first full `npm --prefix frontend run e2e:mock` attempt hit a transient disabled onboarding Continue button in the first test; the focused rerun and full-suite rerun both passed.
- Browser plugin verification attempted after the visible frontend change. The in-app browser was unavailable with `Browser is not available: iab`, so focused Playwright is the UI evidence for this slice.

## Recovery Status

This improves chart reliability during partial service outages. It does not
recover production data. Railway/backend recovery still requires restored
Railway auth or GitHub recovery secrets, followed by `npm run check:data-recovery`.
