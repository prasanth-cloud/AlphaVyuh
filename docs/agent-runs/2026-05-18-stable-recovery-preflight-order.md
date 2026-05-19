# Stable Recovery Preflight Order

Date: 2026-05-18

## Goal

Make the production data recovery preflight easier for the owner to read and
repeat. The checks run concurrently, but the displayed recovery evidence should
always appear in the same order.

## Agent Reports

| Agent | What changed | Why it improves the product | What was learned | Remaining risk |
| --- | --- | --- | --- | --- |
| QA/Data Trust Agent | Sorted `npm run check:data-recovery` results into a fixed order. | The owner can compare runs without wondering whether a changed line order indicates a new failure. | Concurrent checks are fast, but operator-facing output still needs deterministic reporting. | Railway recovery still requires owner credentials. |
| Release Agent | Added tests that assert the preflight result order for healthy and Railway-down states. | Prevents future changes from making the recovery command noisy or inconsistent. | Launch checks should be both accurate and calm. | Real browser smoke still waits on backend recovery. |

## Validation

- `npm run test:data-recovery-check`

