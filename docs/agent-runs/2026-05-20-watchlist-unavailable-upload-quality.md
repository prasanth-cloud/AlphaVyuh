# Watchlist Unavailable State And Upload Quality Analytics

Date: 2026-05-20

## Goal

Prevent a live watchlist API outage from looking like an empty trader account,
and make uploaded broker reports more useful before journal import.

## Agents

| Agent | Work | Why it matters | Residual risk |
| --- | --- | --- | --- |
| Explorer Agent | Identified that `getWatchlists()` returned `[]` on live API failure, causing `/watchlist` to show empty-state copy instead of an outage. | Trader trust depends on distinguishing unavailable account data from genuinely empty watchlists. | Production browser proof still depends on Railway recovery. |
| Product/Data Trust Agent | Changed live `getWatchlists()` failures to surface the backend message and updated `/watchlist` to show a Data Status handoff instead of "No watchlist selected" or "No stocks yet." | Saved lists are no longer treated as empty when the backend is unreachable. | Dashboard widgets still summarize watchlist count defensively; deeper signed-in production checks remain gated. |
| Workflow Agent | Caught scanner and chart add-to-watchlist actions so the new live error is shown as user-facing feedback instead of an unhandled click failure. | Scanner and chart workflows remain usable and honest during watchlist outages. | Broker/auth recovery still needs owner-provided Railway access. |
| Analytics Agent | Added payoff ratio and average holding-period diagnostics to trade report parsing and rendered a compact Trade quality panel on `/upload`. | Uploaded reports now show expectancy, payoff, average hold, and best/worst trades before journal import. | Real broker samples are still needed to tune more export variants. |

## Changes

- `frontend/lib/api.ts`
  - `getWatchlists()` now throws live watchlist outage errors instead of returning an empty list when mock fallback is not allowed.
  - Production mock fallback remains blocked even if stale mock flags are present.
- `frontend/app/(app)/watchlist/page.tsx`
  - Shows "Watchlist data unavailable" with an `/data` handoff when watchlists cannot be loaded.
  - Avoids presenting outage state as "No watchlist selected" or "No stocks yet."
- `frontend/components/scanner/StockDetailPanel.tsx`
  - Shows watchlist load errors when adding a scanner result to a watchlist.
- `frontend/app/(app)/charts/[symbol]/page.tsx`
  - Shows watchlist load errors when adding a chart symbol to a watchlist.
- `frontend/lib/trade-report-import.ts`
  - Computes payoff ratio and average holding days.
- `frontend/app/(app)/upload/page.tsx`
  - Adds a Trade quality panel with expectancy, payoff ratio, average win/loss, average hold, best trade, worst trade, and breakeven count.

## Verification

- PASS `npm test -- tests/unit/watchlists-api.test.ts tests/unit/trade-report-import.test.ts tests/unit/trade-report-journal.test.ts`
- PASS `npm run typecheck`
- PASS focused browser/Playwright check:
  - `/upload` sample report rendered Trade quality with expectancy, payoff ratio, 4.8-day average hold, AUBANK best trade, and TCS worst trade.
  - `/watchlist` loaded locally in mock mode with no page error.
- PASS `npm run e2e:mock`
  - 12 workflow tests passed, including upload-to-journal, scanner-to-watchlist, watchlist planning, and chart context flows.
- EXPECTED FAIL `npm run check:data-recovery`
  - Production API `https://alphavyuh-production.up.railway.app/health` returns Railway fallback 404 `Application not found`.
  - Vercel production env passes: frontend points at recovery API URL, data mode is live, mock fallback is false.
  - Supabase EOD data passes: latest `daily_ohlcv` date `2026-05-19`, `3101/3448` symbols, 90% coverage.
  - Chart smoke config passes for RELIANCE, ITC, AUBANK.
  - GitHub recovery secrets still missing: `RAILWAY_TOKEN`, `RAILWAY_PROJECT_ID`, `RAILWAY_SERVICE`.
  - Local Railway CLI auth is expired and needs `railway login`.

## Next

Railway production backend recovery remains incomplete. Run
`npm run recover:railway-backend:login` or add the required Railway GitHub
secrets, recover the backend, then rerun `npm run check:data-recovery` and the
authenticated production browser smoke before declaring recovery complete.
