# Decision 019 — Add a normalized scanner-definition builder

Status: accepted for the current implementation slice.

## Decision

Expose the scanner-lineage tables through a small visual builder. A user can define an NSE universe, add validated filters to one or more groups, choose each group's AND/OR operator, save the definition, edit it, select it for the scanner, and delete it. The selected definition id is carried into the scanner run request so the durable run can retain the same definition identity.

## Rationale

The previous saved-screen path persisted one JSON filter object and could not represent the durable filter-group model. The builder makes the normalized records usable without pretending that the existing flat EOD engine already implements every expression shape.

## Execution boundary

The first supported filter set maps directly to the existing scanner request contract: price, volume ratio, average volume, RSI, 50 DMA/EMA position, 52-week-high proximity, relative strength, market cap, P/E, ROE, ROCE, and debt/equity. The current engine applies flat AND filters. A definition containing a multi-filter OR group remains editable and explainable but is blocked from execution with an inline reason; it is never silently flattened into a different scan.

## Safety

- Live definitions use authenticated user-client requests and the existing RLS boundary.
- API responses are parsed before UI use; malformed definition/group/filter payloads fail closed.
- Mock mode persists definitions locally for workflow parity without introducing broker or service-role behavior.
- Applying the definition only changes scanner filters and lineage metadata; it does not place orders or bypass setup review.

## Follow-up

Define and test a server-side group-expression contract before enabling OR execution. Apply and RLS-test the scanner migration in the correct AlphaVyuh Supabase project before calling the builder production-ready.
