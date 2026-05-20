# Broker Import Source Hardening - 2026-05-20

## Objective

Make mock broker trade imports safer for multi-broker testing by preserving the
selected broker as the import source, duplicate key, and journal audit label.

## Agent Report

| Agent | Change | Product impact | Learning | Remaining risk |
|---|---|---|---|---|
| Broker Agent | Added broker-specific mock import profiles for Zerodha and Upstox. | Mock imports now mirror the broker selected in the UI instead of writing every order as Zerodha. | Broker testing needs truthful source labels even before live credentials are connected. | Live broker import parity still depends on backend credentials and Railway recovery. |
| Journal Agent | Moved duplicate markers to `alphavyuh-broker-import:{broker}:order:{id}`. | Zerodha and Upstox imports can coexist in the journal without false duplicate matches. | Idempotency must be scoped by broker, not only by order id. | Imported trades still need richer broker metadata once the backend schema is available. |
| QA Agent | Expanded mock order coverage for Zerodha and Upstox imports. | The test suite catches source-label regressions, duplicate handling, and cross-broker collisions. | Focused broker tests are useful gates before enabling real account sync. | Production browser proof still requires Railway and production auth recovery. |

## Validation Plan

- PASS `npm test -- tests/unit/mock-orders.test.ts`
- PASS `npm run typecheck`
- EXPECTED FAIL `npm run check:data-recovery`: production API at `https://alphavyuh-production.up.railway.app` still aborts, Railway GitHub secrets are missing, and local Railway CLI auth needs refresh. Supabase EOD data remains present through `2026-05-19` with `3101/3448` symbols.

## Next Step

After Railway recovery, run live read-only broker checks and align backend import
responses with the same broker-scoped audit markers.
