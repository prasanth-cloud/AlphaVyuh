# AlphaVyuh implementation roadmap

Audit date: 2026-08-20

The roadmap follows the attached sequence while using the repository's existing workflow and safety boundaries. Each milestone should be implemented as a small vertical slice with focused tests and a reviewable change.

## Milestone 0 — repository audit

Status: complete in this checkout.

Deliverables are `docs/current-state.md`, `docs/gap-analysis.md`, this roadmap, and `docs/risks-and-dependencies.md`. No refactor or deletion is required to complete the audit.

## Milestone 1 — durable setup spine

Status: first implementation slice.

Deliverables:

- A user-scoped `setups` table with direction, plan levels, risk/quantity fields, thesis, invalidation, source context, and chart snapshot.
- RLS and indexes for setup ownership and symbol/status lookup.
- A small authenticated CRUD API under `/api/v1/setups`.
- Optional `setup_id` links on workflow state, simulated/broker order records, and journal records.
- Chart-plan handoff creates one setup and carries its id into the decision desk.

Done when a chart plan can be saved as a setup, reopened through the existing watchlist flow, and tested without browser-side credentials or order placement.

## Milestone 2 — rulebook and setup review

Add reusable rulebooks, hard blocks, warnings, checklist evaluations, and risk-budget checks. A setup should reach order review only after its evaluation has a recorded result. Minimum initial checks should cover entry/stop/target geometry, positive risk, quantity, and the configured minimum reward-to-risk ratio.

## Milestone 3 — EOD data quality and scanner lineage

Formalize EOD bars, indicator snapshots, scanner definitions, filter groups, filters, runs, and candidates. Store the matched conditions and rank so a candidate can be explained and converted into a setup without retyping. Keep the initial scope to EOD data; defer live streaming, options, and broad backtesting.

## Milestone 4 — watchlist and journal continuity

Link manual entries, imported trades, simulated captures, and trade reviews to setup ids. Preserve an explicit `UNPLANNED` path for records that do not have a setup. Add status transitions and review-needed behavior without duplicating the server state in a second client store.

## Milestone 5 — Zerodha read-only verification

Verify credential storage, account/position/order read paths, freshness, rate-limit handling, and failure UX in a non-ordering environment. Record the verification evidence and keep the product read-only until reconciliation rules are proven.

## Milestone 6 — broker execution, only after owner approval

Implement explicit confirmation, server-side broker calls, idempotency, status polling/webhooks as appropriate, fill reconciliation, audit events, and automatic journal capture. A live order must never be placed by browser code, and this milestone must remain separately approved from the setup foundation.

## Milestone 7 — reviews and intelligence

Build setup-aware post-trade reviews, rule adherence summaries, outcome analytics, and AI-assisted reflection only after the underlying setup, fill, and journal lineage is reliable.

## Verification rhythm

For each milestone: inspect the diff, run focused unit tests, run the relevant backend/frontend checks, run the mock workflow E2E when the workflow changes, and finish with the repository's full check command where the local environment supports it. Do not claim a migration is applied, a broker is connected, or production is healthy from source-only evidence.
