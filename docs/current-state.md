# AlphaVyuh current state

Audit date: 2026-08-20

Audited source: the clean `main` checkout at commit `7dc2310` (the canonical repository is `prasanth-cloud/AlphaVyuh`). This document describes repository evidence only; it is not a claim about the current production deployment.

## Product and stack

AlphaVyuh is an EOD-first Indian NSE/BSE trading workflow that informs, organizes, executes, and analyzes without presenting itself as an adviser. The current stack is:

- Next.js, React, TypeScript, Tailwind, and Lightweight Charts in `frontend/`.
- FastAPI and Python 3.12 in `backend/`.
- Supabase/Postgres migrations in `supabase/migrations/`.
- Vercel-oriented frontend deployment configuration and a Railway-oriented backend configuration.
- Vitest/Playwright frontend tests and pytest backend tests.

The repository has an existing product surface rather than a blank foundation. Its routes cover dashboard, scanner, watchlist, charts, journal, portfolio, broker settings, data status, alerts, options, and supporting surfaces. The backend includes corresponding routers for scanner, charts, workflow, journal, watchlist, broker, ingest, market, data health, and related features.

## Existing workflow

The current durable workflow state is `workflow_states`, created by `20260505014955_workflow_state.sql`. It is keyed by `(user_id, symbol)` and supports lifecycle values such as `idea`, `watch`, `ready`, `triggered`, `open`, `closed`, `reviewed`, and `invalidated`. It stores entry, stop, target, position size, thesis, invalidation rule, scanner context, broker order id, and journal id.

The current frontend flow is:

1. A user draws a plan on `frontend/app/(app)/charts/[symbol]/page.tsx`.
2. The chart page stores a chart-plan draft in local storage and navigates to the watchlist decision desk.
3. The watchlist imports the draft, converts it into a `WorkflowStatePatch`, and upserts symbol-keyed workflow state.
4. The decision desk can edit the plan and capture a simulated order.
5. The simulated broker path creates a journal entry and associates the order context with workflow state.

This flow is covered by frontend unit tests and the `workflow-mock` end-to-end test. It is useful, but the handoff currently has no first-class setup record or stable setup identifier.

## Existing persistence

At the audited baseline, the migration directory contained 60 migrations covering users, stock data, saved screens, watchlists, chart workspaces, journal entries, ingestion runs, alerts, broker credentials, broker audit, broker orders, order idempotency, workflow states, and related product areas. This implementation adds setup, rulebook, scanner-lineage, and EOD quality/job-evidence migrations as new, unapplied repository changes.

The repository already has safety-relevant tables and controls for broker credentials, broker audit, order idempotency, and atomic broker order intent reservation. The current broker surface is read-only/import-oriented plus simulated capture; the live order path remains gated and must not be treated as enabled by this audit.

At the audited baseline, the existing schema did not contain the durable workflow entities from the attached plan named `setups`, `scanner_candidates`, `scanner_definitions`, `scanner_filter_groups`, `scanner_filters`, `rulebooks`, `rules`, `rule_evaluations`, `trade_reviews`, generic `audit_logs`, or generic `job_runs`. The implementation now adds setup/rulebook/scanner-lineage foundations and a generic service-owned `job_runs` table; trade reviews, generic audit logs, and the normalized scan-builder UI remain gaps. `ingest_runs` remains an existing narrower refresh record, while `job_runs` captures individual EOD import attempts.

The current implementation branch has since added the rulebook/setup-review slice, the scanner-lineage slice, an EOD quality/job-evidence slice, a normalized scanner-definition builder, and explicit `unplanned` journal tagging. The new scanner migration adds owner-scoped definitions, filter groups, filters, runs, and candidates; scanner responses can carry a user-specific run/candidate id, and setup creation accepts `source_scanner_candidate_id`. The EOD migration adds service-only `job_runs` and explicit bhavcopy quality counters; the ingestion service rejects unsafe rows before writes. The scanner builder stores and edits validated filter trees and carries a definition id into runs; the server now evaluates group operators without flattening OR expressions and blocks universes without a verified membership source. Journal create/update and report-import paths distinguish no-setup trades with `unplanned`, with an additive backfill migration for legacy null tags. These changes are repository-local until the correct AlphaVyuh Supabase project is accessible and the migrations are applied and verified there.

## Current verification surface

The repository contains frontend unit tests, backend pytest coverage, and Playwright suites. Relevant existing coverage includes chart-plan handoff behavior and broker order safety/idempotency. Root scripts include type checking, linting, unit tests, mock workflow E2E, launch checks, and contract checks.

## Constraints observed

- The canonical local clone is clean and is used for this implementation. A separate user checkout at `/Users/PRASAANTH/Documents/AlphaVyuh` contains unrelated uncommitted work and is not modified.
- Repository guidance requires small reviewed changes and prohibits pushing directly to `main`.
- Production migrations, live broker orders, billing changes, and production data mutation remain owner-gated.
- Generated Supabase types and production schema equivalence require a database-backed verification step that is not implied by adding a local migration file.
