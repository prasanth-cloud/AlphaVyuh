# Payment Status Read-Only Hardening

## Done

- Removed the implicit expired-plan downgrade from `GET /api/v1/payments/status`.
- Added `POST /api/v1/payments/status/reconcile` as the explicit mutation path for expired-plan maintenance.
- Centralized effective-plan calculation so expired `pro`/`elite` rows are treated as `free` by scanner, watchlist, journal, chart, alert, and price-alert gates.
- Added tests proving status reads do not update the database and the explicit reconcile path does.

## Why

Status checks should be safe to refresh, cache, retry, and inspect without changing billing state. Mutating on GET made a normal UI status read double as maintenance, which is harder to reason about and harder to secure.

## Learned

Removing a side effect from one route is not enough when entitlements are read in several modules. The product needs one shared definition of the user's effective plan.

## Improve Next

- Move the reconcile endpoint behind an internal scheduled maintenance path when billing is enabled.
- Add product metrics for expired paid rows so support can see whether billing state is drifting.
