# Journal chart decision state

Date: 2026-07-16
Issue: #402

## Outcome

AlphaVyuh now captures a versioned, immutable structured chart state after a chart-originated journal draft is created. The journal review surface labels the saved state as decision-time context and labels the chart link as the mutable current chart. This release deliberately does not claim to store an image or screenshot.

## Captured contract

- schema version, symbol, chart timeframe and selected range
- chart type and visible logical range
- active indicators and serialized drawings
- journal-bound entry price and latest bar time
- data source, data mode, data-as-of time, client-observed time, and server-attested attachment time

The frontend deep-clones the decision state before the primary journal mutation. A failed attachment never reverses a successful journal capture and instead produces an explicit warning.

## Boundary and integrity controls

- authenticated, owner-scoped snapshot POST and GET routes
- private `trade-snapshots` bucket with a 64 KiB object limit and JSON MIME restriction
- streaming request-size guard before FastAPI materializes the body
- per-user attachment rate limit and a 15-minute attachment window
- server binding of entry price and server attestation of capture time
- first-write-wins metadata with non-service-role INSERT and UPDATE protection
- deterministic owner-prefixed object paths with path validation
- atomic owner-scoped journal deletion returning cleanup paths, followed by idempotent Storage cleanup
- ambiguous attachment failures re-read committed state before any cleanup

## Verification

- full frontend Vitest suite
- full backend pytest suite
- frontend typecheck and production build
- frontend lint
- targeted request-size, malformed payload, ownership, immutability, ambiguous commit, insert-bypass, deletion-failure, and attach/delete race tests
- signed-in mock browser workflow on the active chart and journal review surfaces at desktop and mobile sizes

## Review gates and follow-ups

- Apply the migration only after owner review and disposable-environment verification of the real policies, trigger role behavior, RPC privileges, and Storage restrictions.
- Add a periodic orphan audit and account-deletion prefix purge before claiming complete account-data deletion.
- Replace the in-process rate limiter with a shared limiter before multi-worker scale.
- An actual chart image/WebP preview is a separate spike; the current UI states that it is unavailable.
