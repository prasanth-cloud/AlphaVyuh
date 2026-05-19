# Chart Outage Copy Agent Run

Date: 2026-05-19
Branch: `codex/chart-outage-copy`

## Agents

| Agent | What changed | Why it improves the product | What was learned | Remaining risk |
| --- | --- | --- | --- | --- |
| Frontend Polish Agent | Updated full-chart and watchlist-chart failure copy to use the shared market-data outage message. | Traders no longer see a misleading generic “No chart data” state when the backend host is down. | Chart loading had better data trust metadata than outage copy; backend fallback 404 could still look like missing symbol history. | Real chart rendering still depends on Railway backend recovery. |
| Backend/Data Agent | Preserved backend error details from candle requests so Railway fallback responses reach the UI normalizer. | The UI can distinguish “symbol has no data” from “API host is unavailable.” | The candle client was dropping response body details and throwing `No data for SYMBOL`. | Other endpoints may still have endpoint-specific generic errors, but scanner/dashboard/data already use shared copy. |
| QA Agent | Added a unit test for Railway fallback candle responses. | Prevents future regressions that hide API hosting failures behind no-data copy. | A small client test catches the important production no-data symptom without needing Railway access. | Browser proof of real EOD charts remains blocked until `/health` recovers. |

## Validation

- `npm --prefix frontend run test -- --run tests/unit/candles-cache.test.ts tests/unit/data-errors.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm --prefix frontend run test -- --run`
- `npm audit --audit-level=moderate`
- `npm run check:data-recovery` (expected failure: Railway production API still returns fallback `404 Application not found`; Vercel env and Supabase EOD pass)
- `npm run test:e2e:layout`
- `npm run test:e2e:mock`
- `npm run test:e2e:perf`
