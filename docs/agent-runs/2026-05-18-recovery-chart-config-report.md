# Recovery Chart Config Report

Date: 2026-05-18

## Goal

Make `npm run check:data-recovery` show the exact chart smoke configuration
that will be used after Railway recovery, so operators know whether
multi-symbol chart evidence is complete.

## Agent Reports

| Agent | What changed | Why it improves the product | What was learned | Remaining risk |
| --- | --- | --- | --- | --- |
| QA/Data Trust Agent | Added a `Chart smoke config` result to the production data recovery preflight. | The owner can see which chart symbols will be verified before trusting watchlist/full-chart recovery. | A hidden default is better than no check, but a visible default is better for launch operations. | Real chart verification still waits on Railway recovery. |
| Release Agent | Added `PRODUCTION_API_CHART_SYMBOLS` to optional GitHub recovery secret reporting. | Missing optional evidence is now visible alongside Railway and authenticated-smoke readiness. | Optional does not mean irrelevant; it means the release owner must consciously accept or configure it. | The required Railway credentials are still missing. |

## Validation

- `npm run test:data-recovery-check`
- `npm run test:production-api-check`

