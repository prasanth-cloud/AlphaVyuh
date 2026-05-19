# Trade Report Upload Analytics - 2026-05-19

## Objective

Replace the placeholder upload page with a real first step toward broker report
analysis: safe CSV parsing, normalized trade preview, and immediate trader
analytics before data is saved.

## Agent Report

| Agent | Change | Product impact | Learning | Remaining risk |
|---|---|---|---|---|
| Product Agent | Converted `/upload` from a coming-soon state into a CSV import and analytics preview. | Traders can paste or upload broker/spreadsheet reports and immediately inspect P&L, win rate, profit factor, drawdown, symbol concentration, monthly P&L, and rejected rows. | A useful local preview is possible before backend persistence and broker-specific import flows are complete. | PDF contract notes and screenshot OCR remain future work. |
| Data Agent | Added a parser that normalizes common broker/export columns and rejects rows missing symbol or P&L/price data. | Bad reports fail visibly instead of producing misleading analytics. | Broker exports vary, so the parser needs clear rejected-row feedback and incremental format support. | Real broker sample files are still needed to tune Zerodha, Upstox, and Groww coverage. |
| QA Agent | Added unit coverage for generic P&L CSVs, calculated P&L rows, short trades, and rejected rows; added `/upload` to layout smoke routes. | The upload surface is now part of routine UI regression coverage. | The old placeholder could pass launch smoke while offering no actual trader value. | End-to-end file-upload persistence should be added when journal import is wired. |

## Validation Plan

- PASS `npm --prefix frontend run test -- tests/unit/trade-report-import.test.ts`
- PASS `npm run test:e2e:layout`
- PASS `npm run typecheck`
- EXPECTED FAIL `npm run check:data-recovery`: production API at `https://alphavyuh-production.up.railway.app` still aborts, required Railway GitHub secrets are missing, and local Railway CLI auth needs refresh. Supabase EOD data is present through `2026-05-19` with `3101/3448` symbols.

## Next Step

Persist selected normalized rows into the journal with duplicate detection,
broker/source labels, setup tagging, and a review queue handoff.
