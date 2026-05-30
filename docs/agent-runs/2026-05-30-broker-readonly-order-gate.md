# Broker Read-Only Order Gate - 2026-05-30

## Goal

Harden broker execution boundaries before any buy/sell path can become a real
broker mutation.

## Changes

- Added a backend read-only smoke gate before any Zerodha or Upstox
  `place_order` adapter call.
- Persisted sanitized `broker_connections.metadata.read_only_smoke` output from
  the Zerodha read-only smoke endpoint: broker id, pass/fail, checked_at, check
  names, booleans, counts, and non-secret error/status fields only.
- Exposed `read_only_smoke_required` and `read_only_smoke_passed` through broker
  status so clients can explain why live submission remains disabled.
- Documented that read-only smoke metadata is a prerequisite, not approval to
  enable live or sandbox orders.
- Added regression tests proving live-confirmed broker order submission blocks
  with `409` until matching same-broker smoke metadata has passed.

## Validation

- `npm --prefix frontend ci` installed locked frontend dependencies for local checks.
- `npm run lint` passed.
- `npm run typecheck` passed.
- `pytest backend/tests/test_broker_order_safety.py backend/tests/test_brokers_router.py` passed.
- `pytest backend/tests` passed: 287 tests.
- `git diff --check` passed.

## Safety

No live or sandbox broker orders were placed. The change keeps buy/sell as
journal/order intent by default and adds a server-side guard for future
misconfiguration.
