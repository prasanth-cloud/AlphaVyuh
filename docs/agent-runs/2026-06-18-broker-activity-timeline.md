# Broker Activity Timeline - 2026-06-18

## Goal

Give traders one truthful place to understand recent order intents, broker
submission state, fills, Journal linkage, and the next safe action.

## Changes

- Added `GET /api/v1/broker/orders/activity`.
- The endpoint returns normalized lifecycle fields only and does not expose
  stored Journal drafts, broker credentials, idempotency keys, or raw broker
  payloads.
- Added a Broker settings timeline for simulated captures, pending/open orders,
  partial fills, completed fills, cancellations, and rejections.
- Pending rows say they are not positions and offer `Check broker`.
- Reconciliation refreshes the timeline; `Open journal` appears only when a
  Journal position exists.
- Updated Broker settings copy so read-only/import behavior and future
  owner-gated sandbox validation are described without implying that submission
  equals execution.

## Verification

- Backend tests cover normalized pending and completed activity and prove raw
  draft data is absent.
- Frontend tests cover pending, partial-fill, rejection, and invalid-time
  presentation.
- Browser coverage verifies pending -> reconcile -> filled -> Journal link.

## Next

1. Apply the atomic intent migration in staging.
2. Run owner-approved sandbox cases for pending, partial, complete, rejected,
   cancelled, and timeout-before-response.
3. Add broker activity summaries to the dashboard cockpit only after real
   sandbox evidence confirms the state transitions.
