# Trade Report Cost And Concentration Analytics

## Objective

Make uploaded broker reports more useful before journal import by surfacing
transaction-cost drag and symbol concentration risk alongside the existing P&L,
win-rate, payoff, holding-period, and journal-ready checks.

## Changes

| Area | What changed | Why it matters | Residual risk |
| --- | --- | --- | --- |
| Parser analytics | Added total reported charges, average charge per trade, charges-to-gross-profit percentage, top symbol, top-symbol P&L share, and top-symbol trade share to `TradeReportSummary`. | Traders can spot churn and accidental concentration before importing trades into review. | Charges are only as reliable as the uploaded broker export columns. |
| Upload review UI | Added a Cost and concentration panel plus review prompts for high cost drag or high symbol concentration. | The upload surface now calls out actionable post-trade review risks, not just aggregate P&L. | Real broker samples are still needed to calibrate thresholds by broker/product. |
| Regression coverage | Extended unit tests for sample, paired execution, and skewed reports; extended the mock upload workflow to assert the new risk audit panel. | Future parser or UI edits should not remove the trader-facing cost/concentration checks silently. | Production browser proof remains blocked by unavailable in-app Browser and Railway recovery. |

## Validation

- PASS `npm test -- tests/unit/trade-report-import.test.ts tests/unit/trade-report-journal.test.ts`
- PASS `npm exec -- playwright test --config=playwright.mock.config.ts tests/e2e/workflow-mock.spec.ts --grep "uploaded trade report"`
- PASS `npm run typecheck`
- PASS `npm run e2e:mock`
- PASS `npm test`
- PASS `npm run test:production-api-check`
- PASS `npm run test:production-smoke-env-check`
- PASS `git diff --check`
- INFO In-app Browser verification was attempted after reading the Browser skill, but `iab` was unavailable and `agent.browsers.list()` returned `[]`; Playwright mock workflow is the browser fallback evidence.
- INFO A first focused workflow run was invoked with live-data forcing flags and failed at the existing journal import step with `Failed to fetch`; rerunning through the repo mock config passed and is the valid workflow result for this slice.

## Follow-up

After Railway recovery, verify real Zerodha and Upstox exports for charge column
mapping and compare the cost-drag thresholds against production broker reports.
