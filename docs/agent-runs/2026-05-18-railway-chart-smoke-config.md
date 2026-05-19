# Railway Chart Smoke Configuration

Date: 2026-05-18

## Goal

Make the Railway recovery workflow match the stricter production chart recovery
gate. Operators need to configure the same multi-symbol chart smoke from GitHub
Actions that they can run locally.

## Agent Reports

| Agent | What changed | Why it improves the product | What was learned | Remaining risk |
| --- | --- | --- | --- | --- |
| Deploy Agent | Passed `PRODUCTION_API_CHART_SYMBOLS` through the manual Railway Backend Recovery workflow and secret-prep helper. | Recovery from GitHub can verify the same launch-candidate chart symbols as local recovery. | Adding a stricter checker is not enough; the deploy path must expose the checker controls. | Railway credentials are still owner-controlled and missing. |
| QA Agent | Updated the Railway secret-prep test to cover the optional chart-symbol secret. | Prevents future drift between the checker, workflow, and helper script. | Recovery evidence needs explicit symbol coverage, not only a generic `/health` pass. | A real post-recovery browser smoke is still required. |
| Product/Release Agent | Updated release and environment runbooks with chart-symbol and authenticated-smoke requirements. | The owner gets a concrete checklist for real EOD data recovery instead of guessing which optional values matter. | The launch gate should distinguish public data recovery, authenticated workflow recovery, and chart-symbol coverage. | The goal remains blocked until Railway hosting is restored. |

## Validation

- `npm run test:railway-secret-prep`

