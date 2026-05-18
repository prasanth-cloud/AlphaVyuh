# Production Mock Fallback Guard Agent Run

Date: 2026-05-18

## Goal

Prevent AlphaVyuh production from silently showing demo data when the Railway API
is down or when stale production environment flags still include mock fallback
values.

## Agent Reports

| Agent | What changed | Why it improves the product | What was learned | Remaining risk |
| --- | --- | --- | --- | --- |
| Product/Data Trust Agent | Changed the runtime guard so public production deployments with Supabase env cannot use client mock fallback, even if mock fallback flags are present. | Traders see either real EOD data or a clear data-service outage, not deterministic demo data that looks like market data. | Production env can retain old mock flags; product code should not blindly trust them. | Railway still has to be restored before real EOD data appears. |
| Frontend Agent | Updated the top-bar data badge to use the same runtime fallback guard as API calls. | The badge now reports `Data API down` in production outage states instead of `Demo data`. | Status UI must share the same runtime rules as the data layer. | A production redeploy is required before the live frontend uses this guard. |
| QA Agent | Added runtime-mode tests for production mock fallback and preview mock fallback behavior. | Prevents future changes from re-enabling demo fallback in production by accident. | Small unit tests catch a high-trust product issue before browser QA. | Full authenticated browser smoke still requires the Railway API to be available. |

## Validation

- `npm --prefix frontend run test -- --run tests/unit/runtime-mode.test.ts tests/unit/data-mode.test.ts`
- `npm run typecheck`
- `npm run lint`

## Current Blocker

This guard does not restore production data by itself. It makes the current
production failure honest: AlphaVyuh should show a service outage until the
Railway backend serves the FastAPI app again and the production data smoke passes.
