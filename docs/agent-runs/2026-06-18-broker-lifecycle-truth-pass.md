# Broker Lifecycle Truth Pass - 2026-06-18

## Goal

Stop treating broker submission as execution. A pending live order with zero
fills must not appear as an open position or completed Journal capture.

## Changes

- The order route now preserves the adapter's canonical execution status:
  `PENDING`, `OPEN`, `PARTIAL`, `COMPLETE`, `CANCELLED`, or `REJECTED`.
- Live orders with zero reported fills do not create an open Journal position.
  Their workflow remains `triggered` while reconciliation is required.
- Partial or complete fills create a Journal entry using broker-reported filled
  quantity and average fill price, not requested quantity and limit price.
- Order responses expose execution status, filled quantity, average fill price,
  rejection reason, and whether reconciliation is still required.
- Chart feedback no longer says Journal capture completed when a live order has
  no Journal entry, and it only refreshes positions after a real entry exists.
- Watchlist feedback uses the backend lifecycle message instead of assuming
  every successful request created a Journal position.
- `POST /api/v1/orders/reconcile/{broker_order_id}` refreshes a submitted order
  through its broker adapter, updates the broker log, creates the Journal when
  the first fill appears, and updates an existing open Journal as cumulative
  fills increase.
- Retrying the same unchanged pending intent reuses its persisted broker-order
  lifecycle row before calling the adapter, avoiding duplicate route-level
  broker records and duplicate submissions.

## Safety

This change does not enable live broker execution. Existing owner, plan,
confirmation, token, and fresh read-only-smoke gates remain in place.

## Verification

- Pending live submission: no Journal entry, workflow remains triggered.
- Partial fill: Journal quantity and price match broker fill data.
- Existing simulated capture and idempotent retry behavior remain covered.

## Next

1. Apply and verify the atomic order-intent migration in staging; local SQL
   execution was unavailable because Docker/Postgres was not running.
2. Add a broker activity timeline and an explicit user action to reconcile
   pending orders.
3. Validate pending, partial, complete, rejected, cancelled, and
   timeout-before-response paths in broker sandboxes before enabling live
   execution.
