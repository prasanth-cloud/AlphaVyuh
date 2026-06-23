# Order Intent To Journal Idempotency - 2026-06-18

## Goal

Make chart and watchlist order capture safe to retry without creating duplicate
broker orders, duplicate journal entries, or duplicate workflow state.

## Problem

Broker adapters already deduplicated live broker calls by idempotency key, but
the key was generated inside the API client for each submission. If a broker
accepted an order and the response was lost, a user retry could create a new
intent key. Even when an adapter returned a cached broker result, the route
could create another journal entry.

## Changes

- Chart and watchlist order tickets now keep one UUID for an unchanged order
  intent.
- Editing a material order field creates a new intent fingerprint and UUID.
- A failed request reuses the same UUID; a successful request resets it so a
  later intentional order can proceed.
- The backend records the order-intent marker with the journal entry and checks
  it before contacting a broker or creating another journal entry.
- Idempotent retries return the existing journal result with
  `status: deduplicated`.
- Reusing an intent key after materially changing symbol, side, quantity, or
  price returns `409 Conflict` instead of misleadingly reusing another order.
- Mock mode follows the same retry contract.
- Trader-facing journal copy strips the internal marker.
- Chart and watchlist success actions open Journal filtered to the traded
  symbol.

## Safety

This does not enable live or sandbox broker execution. Existing owner,
paid-plan, explicit-confirmation, token, and fresh read-only-smoke gates remain
in place.

## Verification

- Backend broker safety tests cover repeated intent reuse.
- Frontend tests cover UUID/fingerprint behavior and mock journal
  deduplication.
- Browser workflow covers watchlist planning, order draft capture, and journal
  handoff.

## Next

1. Apply and verify
   `20260619004532_atomic_order_intent_reservation.sql` in staging before any
   sandbox order test. It adds the dedicated Journal key and unique broker and
   Journal intent indexes.
2. Reconcile broker order status into the existing journal entry rather than
   assuming submission means fill.
3. Run sandbox lifecycle tests for accepted, rejected, partial fill, cancel,
   and timeout-before-response.
