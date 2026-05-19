# Production Smoke Entrypoint

## Goal

Make the post-Railway recovery browser smoke explicit so agents can verify the
same production flow every time: login, dashboard, scanner, watchlist add,
watchlist chart, full chart, journal, settings, broker, and data status.

## Agent Report

| Agent | Changed | Why it improves the product | Learned | Remaining risk |
| --- | --- | --- | --- | --- |
| QA Agent | Added root and frontend smoke scripts for signed-in mock and production flows. | The recovery checklist now has a single command for the browser smoke that was previously only documented as a manual expectation. | The existing signed-in smoke covered core workflow pages but did not include settings, broker, or data status. | Production smoke still needs Railway recovered and a valid QA login before it can prove real data end to end. |
| Frontend Polish Agent | Extended the signed-in smoke to touch dashboard, scanner, watchlist symbol add, full chart, journal, settings, broker, and data pages. | These checks protect the minimal professional trader workflow without adding new UI clutter. | A smoke test should prove the actual trader path, not only isolated routes. | It remains a smoke test, not a full visual or performance audit. |
| Release Agent | Added `PLAYWRIGHT_EXPECT_REAL_DATA=true` to the production smoke command. | After Railway recovery, the browser smoke will reject obvious demo/mock copy on key pages. | Real-data proof needs both API checks and browser copy/data-state checks. | It cannot pass while production API returns Railway fallback 404. |

## Commands

- `npm run test:e2e:smoke`
- `npm run test:e2e:prod:smoke`

## Current Blocker

Production browser smoke remains blocked by Railway auth/redeploy. Run:

```bash
npm run recover:railway-backend:login
```

Then rerun `npm run check:data-recovery` and `npm run test:e2e:prod:smoke`.
