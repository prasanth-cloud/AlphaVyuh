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

Remaining: reconcile every imported fill to a setup, add review-aware outcome analytics, and verify the new migration/RLS behavior in the correct Supabase project before production use.

## Milestone 5 — Zerodha read-only verification

Verify credential storage, account/position/order read paths, freshness, rate-limit handling, and failure UX in a non-ordering environment. Record the verification evidence and keep the product read-only until reconciliation rules are proven.

## Milestone 6 — broker execution, only after owner approval

Implement explicit confirmation, server-side broker calls, idempotency, status polling/webhooks as appropriate, fill reconciliation, audit events, and automatic journal capture. A live order must never be placed by browser code, and this milestone must remain separately approved from the setup foundation.

## Milestone 7 — reviews and intelligence

Build setup-aware post-trade reviews, rule adherence summaries, outcome analytics, and AI-assisted reflection only after the underlying setup, fill, and journal lineage is reliable.

## Verification rhythm

For each milestone: inspect the diff, run focused unit tests, run the relevant backend/frontend checks, run the mock workflow E2E when the workflow changes, and finish with the repository's full check command where the local environment supports it. Do not claim a migration is applied, a broker is connected, or production is healthy from source-only evidence.
