# Decision 019 — Add a normalized scanner-definition builder

Status: accepted for the current implementation slice.

## Decision

Expose the scanner-lineage tables through a small visual builder. A user can define an NSE universe, add validated filters to one or more groups, choose each group's AND/OR operator, save the definition, edit it, select it for the scanner, and delete it. The selected definition id is carried into the scanner run request so the durable run can retain the same definition identity.

## Rationale

The previous saved-screen path persisted one JSON filter object and could not represent the durable filter-group model. The builder makes the normalized records usable without pretending that the existing flat EOD engine already implements every expression shape.

## Execution boundary

The first supported filter set maps directly to the existing scanner request contract: price, volume ratio, average volume, RSI, 50 DMA/EMA position, 52-week-high proximity, relative strength, market cap, P/E, ROE, ROCE, and debt/equity. The server evaluates groups as AND across groups and applies the selected AND/OR operator to filters inside each group. A definition is never silently flattened into a different scan.

All NSE equity is the only runnable universe in this slice. Nifty 500, Nifty MidSmallcap 400, and custom selections are persisted for future membership-source integration but are blocked until their membership data can be verified.

## Safety

- Live definitions use authenticated user-client requests and the existing RLS boundary.
- API responses are parsed before UI use; malformed definition/group/filter payloads fail closed.
- Mock mode persists definitions locally for workflow parity without introducing broker or service-role behavior.
- Applying the definition only changes scanner filters and lineage metadata; it does not place orders or bypass setup review.

## Follow-up

Apply and RLS-test the scanner migration in the correct AlphaVyuh Supabase project, then run the group-expression path against real EOD data before calling the builder production-ready.
