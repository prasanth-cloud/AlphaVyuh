# Multi-Symbol Production Chart Smoke

Date: 2026-05-18

## Goal

Strengthen production recovery verification so chart data is not considered
healthy just because one symbol works. Watchlist and full-chart confidence needs
multiple representative symbols with enough EOD history.

## Agent Reports

| Agent | What changed | Why it improves the product | What was learned | Remaining risk |
| --- | --- | --- | --- | --- |
| QA/Data Trust Agent | Updated `npm run check:production-api` to verify daily chart history for `RELIANCE`, `ITC`, and `AUBANK` by default. | Recovery now catches missing or shallow chart data across multiple common watchlist symbols before users see blank/short charts. | The existing checker already enforced freshness and 180+ days of chart span, but only for one symbol. | Railway is still down, so the stricter live smoke cannot pass until backend hosting is recovered. |
| Release Agent | Made the chart smoke symbol list configurable with `PRODUCTION_API_CHART_SYMBOLS`. | Operators can add launch-candidate symbols without editing code. | Symbol coverage needs to be an explicit launch gate, not a one-off manual browser observation. | If a configured symbol is delisted or intentionally absent, operators must update the symbol list with equivalent active symbols. |

## Validation

- `npm run test:production-api-check`

