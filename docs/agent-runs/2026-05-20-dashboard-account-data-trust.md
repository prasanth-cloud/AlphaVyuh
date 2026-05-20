# Dashboard Account Data Trust

Date: 2026-05-20

## Goal

Stop dashboard and Data Status account workflow summaries from converting live
authenticated API failures into misleading empty or healthy defaults.

## Agents

| Agent | Work | Why it matters | Residual risk |
| --- | --- | --- | --- |
| Explorer Agent | Confirmed dashboard hydration converted failed watchlist, journal, and broker calls into zero-count or simulated defaults. | First-screen workflow guidance should not tell a trader they have no lists, no trades, or no broker when account services are unavailable. | Production proof remains blocked until Railway is restored. |
| Data Trust Agent | Made live journal entries, journal stats, and broker status calls throw on non-OK/network failure instead of returning empty or simulated defaults. | Downstream UI can distinguish unavailable account data from real empty account state. | Other low-risk consumers still catch these errors and fall back locally where the workflow can continue. |
| Dashboard Agent | Added account-data issue tracking to Dashboard and Data Status surfaces. | Dashboard and Data Status now say account workflow metrics are paused and avoid counting saved data as empty. | Browser recovery smoke still needs real production auth after Railway recovery. |
| Workflow QA Agent | Stabilized the upload sample-report smoke against hydration timing and preserved chart handoff query params until the watchlist draft is consumed. | Full mock workflow is less flaky and keeps the chart-to-watchlist context handoff protected. | The broad workflow suite remains serial and can still expose unrelated timing issues. |

## Changes

- `frontend/lib/api.ts`
  - Added shared response error extraction.
  - `getJournalEntries()`, `getJournalStats()`, and `getBrokerStatus()` now throw live-mode errors instead of returning empty/simulated defaults.
- `frontend/lib/account-data-status.ts`
  - Added shared account-data issue capture helpers for dashboard/data surfaces.
- `frontend/app/(app)/dashboard/page.tsx`
  - Shows an Account data unavailable card when watchlist, journal, or broker account calls fail.
  - Setup progress and Review pulse no longer present unavailable account data as zero progress or zero review coverage.
- `frontend/app/(app)/data/page.tsx`
  - Shows account-data service issues and pauses broker/journal workflow metrics when account services fail.
- `frontend/app/(app)/watchlist/page.tsx`
  - Preserves `planDraft=chart` route params until chart handoff context is applied.
- `frontend/tests/e2e/workflow-mock.spec.ts`
  - Waits through sample-report hydration before asserting upload analytics.
  - Full chart-to-watchlist handoff remains covered by the existing mock workflow.

## Verification

- PASS `npm test -- tests/unit/account-data-api.test.ts tests/unit/watchlists-api.test.ts`
- PASS `npm run typecheck`
- PASS `npm run e2e:mock`
  - 12 workflow tests passed after stabilizing upload hydration and chart handoff route cleanup.
- PASS local browser check:
  - `/dashboard` loaded in mock mode with market pulse, setup progress, review pulse, and no account-data warning.
  - `/data` loaded in mock mode with market data, broker channel, journal readiness, and no account-data warning.
- EXPECTED FAIL `npm run check:data-recovery`
  - Production API `https://alphavyuh-production.up.railway.app/health` returns Railway fallback 404 `Application not found`.
  - Vercel production env passes: frontend points at recovery API URL, data mode is live, mock fallback is false.
  - Supabase EOD data passes: latest `daily_ohlcv` date `2026-05-19`, `3101/3448` symbols, 90% coverage.
  - Chart smoke config passes for RELIANCE, ITC, AUBANK.
  - GitHub recovery secrets still missing: `RAILWAY_TOKEN`, `RAILWAY_PROJECT_ID`, `RAILWAY_SERVICE`.
  - Local Railway CLI auth is expired and needs `railway login`.

## Next

Railway production backend recovery remains incomplete. Restore/reattach the
Railway backend through local login or GitHub recovery secrets, then rerun
`npm run check:data-recovery` and the authenticated production browser smoke.
