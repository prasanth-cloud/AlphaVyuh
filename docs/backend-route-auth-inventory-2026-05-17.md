# Backend Route Auth Inventory - 2026-05-17

## Summary

The Security Agent reviewed backend route exposure and split routes into:

- intentionally public market/reference/calculator/intake routes
- user-authenticated workspace routes
- admin or shared-secret gated operational routes

The actionable non-gated issue was that `/api/v1/data/health` and
`/api/v1/data/runs` were public while returning operational diagnostics such as
provider readiness, live stream details, subscribed symbols, and ingest run
metadata.

## Change

- Require `get_current_user_id` for `/api/v1/data/health`.
- Require `get_current_user_id` for `/api/v1/data/runs`.
- Update frontend data-health fetches to send auth headers.
- Add a route inventory regression test with an explicit public-route allowlist.
- Add backend-live smoke coverage proving unauthenticated data ops endpoints are
  rejected while authenticated calls still work.

## What We Learned

Public market data can stay public, but operational diagnostics are different:
they describe system state, provider status, and refresh behavior. Those belong
inside the signed-in workspace or an admin/operator surface.

## Improve Next

- Add rate-limit/cost tests around public live-market and chart provider-backed
  endpoints.
- Move plan-expiry downgrade out of `GET /api/v1/payments/status` into a POST or
  background maintenance path.
