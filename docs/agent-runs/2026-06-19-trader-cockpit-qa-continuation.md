# Trader Cockpit QA Continuation - 2026-06-19

## Goal

Continue the end-to-end trader-cockpit pass across landing, login, dashboard,
scanner, watchlist, charts, broker lifecycle, Journal capture, and measured
performance without enabling owner-gated production actions.

## Current Product Assessment

- Landing: the branch presents AlphaVyuh as an EOD trader cockpit and explains
  the scan-to-review loop without claiming real-time data or live execution.
- Login: the branch uses a focused sign-in form with remembered-email recovery,
  password visibility, reset access, and account-request routing.
- Dashboard: Session is the focused workspace; Full desk keeps the complete
  instrument set available on demand.
- Scanner: repeated identical EOD scans use a bounded backend result cache.
  Native C++ or Rust work remains deferred until production profiling proves a
  CPU-heavy kernel dominates p95 latency.
- Watchlist and chart: scanner context, plan levels, notes, order-intent drafts,
  and Journal handoff stay attached to the symbol.
- Broker and Journal: submission is not treated as execution. Unfilled orders
  remain pending, fills use broker-reported quantity and price, and retries use
  one order-intent key.

## Fix

- Updated the mock workflow provenance test to switch explicitly from the
  focused Session workspace to Full desk before asserting lazy full-desk
  modules. This preserves the simpler default dashboard while keeping deep
  cockpit coverage.

## Verification

- Frontend unit tests: 496 passed.
- Backend tests: 351 passed.
- Frontend lint: passed.
- Frontend typecheck and build: passed.
- Layout smoke: 17 passed across desktop, tablet, mobile, dark, and light.
- Mock workflow smoke: 17 passed.
- Performance smoke: 2 passed.
  - dashboard: 684 ms
  - scanner: 633 ms
  - watchlist decision desk: 768 ms
  - full chart: 962 ms
  - journal: 660 ms
- Dependency audit: no known vulnerabilities at moderate severity or higher.
- Production public posture: passed.
- Production API: market summary dated 2026-06-18, breadth available, and
  1,290 daily candles available for RELIANCE, ITC, and AUBANK.

## Remaining Gates

1. Production still serves the older landing and login build. Publishing this
   branch requires an intentional review, commit, PR, and deployment.
2. Signed-in production scanner, watchlist, chart, and Journal smoke requires
   short-lived QA credentials and a production API bearer token.
3. The atomic order-intent migration must be applied and verified in staging
   before any owner-approved sandbox broker order.
4. Live broker execution remains disabled until sandbox lifecycle,
   idempotency, reconciliation, and legal checks are complete.
5. A production scanner p50/p95 benchmark is still required before claiming a
   measured 2x improvement. Local mock timing is not production latency proof.

## Improve Next

1. Review and split the large branch into focused PRs: experience, scanner
   latency, and broker lifecycle.
2. Deploy a preview and compare landing, login, Session dashboard, scanner,
   watchlist, full chart, and Journal at consistent desktop and mobile sizes.
3. Run authenticated production smoke and save scanner cold, helper-warm, and
   result-cache-hit p50/p95 evidence.
4. Apply the atomic intent migration in staging, then run owner-approved broker
   sandbox cases for pending, partial, complete, rejected, cancelled, and
   timeout-before-response states.
