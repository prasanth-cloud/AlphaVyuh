# 2026-05-30 - Sector taxonomy trust

## Scope
- Implemented #285 narrowly: sector list/audit API contract, sector metadata, NSE sectoral-index reference labels, and dashboard metadata copy.
- `/api/v1/market/sectors` now returns every mapped active sector instead of hiding sectors below a count threshold.
- Added `/api/v1/market/sectors/audit` for source/contract/reference metadata, active/classified/unmapped counts, unmapped symbol samples, and sector counts.
- Kept AlphaVyuh equity-universe sectors separate from NSE sectoral index labels in metadata so the API does not imply official taxonomy parity.
- Aligned live sector-index labels with the NSE sectoral-index reference list while preserving provider symbols separately.

## Validation
- `python -m pytest backend/tests/test_market_aux_outage_status.py backend/tests/test_market_overview_failsoft.py backend/tests/test_route_auth_inventory.py`
- `npm --prefix frontend run test -- --run tests/unit/market-aux-api.test.ts`
- `npm run lint`
- `npm run typecheck`

## Remaining risk
- This local run did not query production Supabase, so it proves the contract shape and unmapped-count path but not the current production unmapped count.
- `metadata.contract_as_of` is the documented API contract date, not a latest-universe refresh timestamp.
