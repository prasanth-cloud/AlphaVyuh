# AlphaVyuh implementation roadmap

Audit date: 2026-08-20

The roadmap follows the attached sequence while using the repository's existing workflow and safety boundaries. Each milestone should be implemented as a small vertical slice with focused tests and a reviewable change.

## Milestone 0 — repository audit

Status: complete in this checkout.

Deliverables are `docs/current-state.md`, `docs/gap-analysis.md`, this roadmap, and `docs/risks-and-dependencies.md`. No refactor or deletion is required to complete the audit.

## Milestone 1 — durable setup spine

Status: complete in `feat/durable-setup-spine`.

Deliverables:

- A user-scoped `setups` table with direction, plan levels, risk/quantity fields, thesis, invalidation, source context, and chart snapshot.
- RLS and indexes for setup ownership and symbol/status lookup.
- A small authenticated CRUD API under `/api/v1/setups`.
- Optional `setup_id` links on workflow state, simulated/broker order records, and journal records.
- Chart-plan handoff creates one setup and carries its id into the decision desk.

Done when a chart plan can be saved as a setup, reopened through the existing watchlist flow, and tested without browser-side credentials or order placement.

## Milestone 2 — rulebook and setup review

Status: implemented in the current milestone slice; migration application and production verification remain pending external Supabase access.

Delivered:

- Owner-scoped `rulebooks`, `rulebook_rules`, and `setup_rule_evaluations` tables with RLS, composite ownership foreign keys, and review status fields on `setups`.
- Deterministic backend evaluator and authenticated rulebook/review endpoints.
- Watchlist Decision Desk review gate: a durable setup is synchronized, reviewed, recorded, and marked Ready before journal/order capture unlocks.
- Mock-mode parity, Settings > Discipline rulebook creation, malformed-response tests, migration-contract tests, and browser coverage.

Remaining for this milestone: apply and verify the migration in the correct Supabase project, then confirm the live authenticated path.

## Milestone 3 — EOD data quality and scanner lineage

Status: scanner lineage and the first EOD quality/job-evidence slice are implemented locally; database application and live verification remain pending.

Delivered in the current slice:

- User-owned scanner definitions, filter groups, filters, run records, and ranked candidate snapshots with RLS.
- Completed scanner runs record the exact input definition, EOD trade date, source metadata, match reasons, confidence reasons, and a compact result snapshot.
- Scanner responses carry user-specific `scan_run_id` and `candidate_id` values without placing user-owned ids in the shared market-result cache.
- `setups.source_scanner_candidate_id` and the chart/watchlist handoff preserve candidate lineage into the durable setup spine.
- Authenticated read endpoints expose run history and candidate evidence; definition CRUD is available for the next scan-builder UI slice.
- The bhavcopy path validates rows before writes, rejects bad OHLCV/missing/duplicate rows, and records explicit quality counters.
- Each bhavcopy attempt creates best-effort service-only `job_runs` evidence with status, timing, input, result, and failure details.
- The scanner UI now has a normalized definition builder for owner-scoped universes, filter groups, and validated filter values. Definitions can be created, edited, selected, and carried into scanner run requests with their `scanner_definition_id`.
- The builder preserves AND/OR group intent, and the server evaluates groups as AND across groups with the selected operator inside each group. OR expressions are no longer flattened into a false AND scan.
- All NSE equity is the only runnable universe until verified Nifty 500, MidSmallcap 400, or custom membership data is connected; other choices remain stored but visibly blocked.

Remaining for this milestone:

- Add database-backed verification for `job_runs` and the new bhavcopy quality columns, including service-role-only access and failure recovery.
- Apply the new migration in the correct Supabase project and verify RLS with an authenticated user and a second-user denial check.
- Verify the server-side group-expression path against applied EOD data after the correct Supabase project is accessible.

Live streaming, options, and broad backtesting remain deferred.

## Milestone 4 — watchlist and journal continuity

Status: setup-linked manual/import continuity and durable post-trade review persistence are implemented locally; migration application and production verification remain pending.

Delivered:

- Journal create/update paths mark records without a durable setup as `unplanned`.
- CSV report imports use the explicit `unplanned` tag and include an `UNPLANNED` entry marker.
- Existing null setup tags are backfilled by an additive migration.
- Existing setup-linked chart/watchlist/simulated flows retain their `setup_id` and review gate.
- `trade_reviews` stores one owner-scoped review artifact per closed journal entry, including plan adherence, mistakes, lesson, follow-up, source, and review timestamps.
- Authenticated review list/save endpoints use the user's RLS-scoped Supabase client.
- Existing journal lesson writes are synchronized into `trade_reviews`, so older journal clients do not silently lose review durability.
- The journal review queue hydrates the durable review records while retaining its existing closed-trade and lesson UX.
- Journal entries without a `setup_id` now show their reconciliation state and load same-symbol active setups for owner resolution; linking uses the existing owner/symbol validation on the journal update endpoint.
- Journal analytics now joins closed trades to completed `trade_reviews` and reports plan-adherence outcomes, setup-linked versus unplanned coverage, and an explicit five-review descriptive-sample guard.
- Review enrichment is optional at runtime: core realized P&L/drawdown analytics remain available when the review table is unavailable, and the response marks the review data state.
- The frontend validates the analytics response, renders process outcomes with loading/error-safe copy, and refuses malformed review summaries instead of treating them as empty history.

Remaining: verify the new migration/RLS behavior in the correct Supabase project before production use.

## Milestone 5 — broker read-only verification

Status: the adapter-backed account snapshot slice is implemented locally; real-account verification and production Supabase migration evidence remain blocked.

Delivered:

- Upstox read-only positions map NSE/BSE equity rows into the shared position contract and skip derivatives until their instrument model exists.
- Authenticated `/api/brokers/{broker}/positions` and existing holdings routes are available for owner-scoped account reads.
- The broker settings page can load a read-only holdings/positions snapshot with explicit unavailable and empty states; it never calls an order route.
- Authenticated `/api/brokers/{broker}/orders` exposes a secret-free, broker-reported equity orderbook snapshot with explicit loading, empty, and unavailable UI states.
- Zerodha and Upstox adapter order lists exclude non-NSE/BSE rows until a separate derivatives model exists, preventing unsupported orders from entering equity workflows.
- Broker-imported fills inherit a validated durable setup only when one active owner setup is an unambiguous symbol match; ambiguous or missing matches are explicitly tagged `unplanned`.
- Malformed broker response payloads are rejected in the frontend instead of becoming false-empty account state.

Remaining:

- Run the owner-approved Zerodha/Upstox real-account smoke and record profile, holdings, positions, orderbook, tradebook, and import evidence.
- Surface broker-import reconciliation state and allow an owner to resolve ambiguous imports to a durable setup. The journal resolution panel is now delivered for same-symbol active setups; durable migration/RLS verification is still pending.
- Apply and verify the current migrations in the correct Supabase project before production use.

## Milestone 6 — controlled broker execution foundation, only after owner approval

The local execution boundary now has the first vertical slice: the watchlist shows a
broker order confirmation sheet only when the broker is connected, owner-enabled,
plan-eligible, the durable setup is `ready`, and the latest rule evaluation allows
proceeding. The browser sends only an explicit `live_confirmed` request with a caller
idempotency key; the backend revalidates setup ownership, lifecycle, review
permission, credentials, same-broker read-only smoke, and idempotency before calling
Zerodha or Upstox. Material plan edits invalidate the prior review and require a
fresh evaluation. Live routing remains disabled by default and no production order
has been placed.

The lifecycle continuation now adds a secret-free owner-scoped `audit_logs` migration,
backend event recording for OAuth/read-only reads/imports/order intents/submissions/
failures/reconciliation, a fail-closed required audit record before a live adapter call,
the authenticated `/api/v1/broker/audit` endpoint, and a broker-settings audit timeline.
Pending broker orders are automatically rechecked every 30 seconds while the activity
page is open, and reconciliation refreshes the audit timeline.

Remaining: apply and verify the migration/RLS behavior in the correct Supabase project,
complete fill reconciliation against the applied schema, run owner-approved real-account
tests, and separately approve any production enablement. No live or production order has
been placed.

## Milestone 7 — reviews and intelligence

Status: the first setup-aware outcome slice is implemented locally; database-backed and production verification remain pending.

Delivered:

- Journal analytics accepts optional exit-date bounds and reports the applied analysis window.
- Realized R-multiple metrics use the recorded entry stop and quantity, exclude trades without a valid risk plan, and show coverage explicitly.
- Outcome cohorts group the same closed trades by scanner provenance, current symbol-sector context, and holding period.
- The journal UI exposes date filters, R-multiple coverage, cohort tables, and MAE/MFE summaries from an explicitly labeled daily-OHLCV high/low proxy.
- MAE/MFE coverage is reported per trade; missing bars and missing stop risk remain visible instead of being converted into false precision.
- The journal renders the returned per-trade MAE/MFE rows with EOD bar counts and an explicit complete/partial/unavailable coverage state.
- Frontend response parsing rejects malformed new analytics fields, and mock browser coverage exercises the new review surface.

Remaining:

- Add persisted intratrade high/low paths before treating MAE/MFE as execution-accurate rather than an EOD proxy.
- Add benchmark/market-context joins only after the data source and attribution definition are approved.
- Keep sample-size warnings visible; these cohorts are descriptive and are not investment advice.

## Verification rhythm

For each milestone: inspect the diff, run focused unit tests, run the relevant backend/frontend checks, run the mock workflow E2E when the workflow changes, and finish with the repository's full check command where the local environment supports it. Do not claim a migration is applied, a broker is connected, or production is healthy from source-only evidence.
