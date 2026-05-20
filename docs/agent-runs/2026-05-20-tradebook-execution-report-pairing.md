# Tradebook Execution Report Pairing - 2026-05-20

## Objective

Accept broker tradebook-style CSV uploads where BUY and SELL executions are
separate rows, then convert matched executions into closed trades for analytics
and journal review.

## Agent Report

| Agent | Change | Product impact | Learning | Remaining risk |
|---|---|---|---|---|
| Explorer Agent | Confirmed the upload parser only accepted one-row completed trades and recommended FIFO execution pairing. | The next implementation targeted a real broker-report format used by traders. | Broker reports are often execution ledgers, not clean trade summaries. | Live broker exports still need samples from each connected broker. |
| Parser Agent | Added a second parser path for execution rows with symbol, date, BUY/SELL side, quantity, price, and charges. | Zerodha/Kite-style tradebook rows can now become analytics-ready trades instead of rejected rows. | Completed-trade CSV support can remain intact while execution rows use FIFO lots. | Corporate actions and intraday product metadata are still outside this parser. |
| Journal Agent | Verified paired execution trades remain journal-ready without changing journal import contracts. | Imported tradebook pairs can flow into closed journal review entries. | Stable parsed trade fields are enough for current duplicate markers. | Backend persistence remains blocked until Railway recovery. |
| QA Agent | Added unit coverage for weighted fills, partial exits, short-side pairing, unmatched open lots, and journal import. | The report upload path now guards against the most common broker tradebook edge cases. | The first test pass clarified broker detection and ordering assumptions. | Production browser proof still requires Railway and production auth recovery. |

## Validation Plan

- PASS `npm test -- tests/unit/trade-report-import.test.ts tests/unit/trade-report-journal.test.ts`
- PASS `npm run typecheck`
- EXPECTED FAIL `npm run check:data-recovery`: production API at `https://alphavyuh-production.up.railway.app` still aborts, Railway GitHub secrets are missing, and local Railway CLI auth needs refresh. Supabase EOD data remains present through `2026-05-19` with `3101/3448` symbols.

## Next Step

After Railway recovery, collect real Zerodha and Upstox tradebook exports and
verify parser mappings against production uploads.
