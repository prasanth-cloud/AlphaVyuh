# AlphaVyuh gap analysis

Audit date: 2026-08-20

This maps the attached vertical-slice plan to the existing `main` branch. Priorities describe implementation order, not production readiness.

## Priority gaps

### P0 — durable setup identity

The current chart handoff persists a symbol-keyed workflow state and local chart-plan draft, but it does not create a durable setup entity. As a result, the same business object cannot yet be referenced consistently by workflow state, order intent, fill reconciliation, journal entry, and later review.

The first implementation slice should add a user-scoped `setups` table, a small authenticated API, and a chart-handoff integration that creates one setup and carries its id into workflow state. This is deliberately narrower than implementing the complete trading platform.

### P0 — schema and environment verification

The repository has a substantial migration history and prior schema-equivalence documentation, but adding a migration is not the same as applying or validating it in staging or production. Local migration syntax, generated types, RLS behavior, and Supabase migration drift need separate checks before any environment mutation.

### P1 — rulebook and risk evaluation

The existing workflow stores plan fields, but there is no first-class rulebook, rule, or evaluation model. The attached plan calls for hard blocks, warnings, checklist results, risk budget, and a pre-order review. These should be built after setup identity exists so evaluations attach to a setup rather than to a symbol-only record.

### P1 — scanner definitions and candidate lineage

The existing scanner has saved screens and scanner context. The scanner-lineage slice now adds explicit owner-scoped scanner-definition, filter-group, filter, run, and candidate entities. It preserves why a candidate matched, its rank and EOD snapshot, and links a candidate to the setup created from it. The scanner now has a normalized definition/group/filter builder with validated EOD-compatible filters and a server-side group evaluator. All NSE equity is runnable; named-index/custom membership sources, production migration/RLS verification, and live-data execution remain.

### P1 — EOD job and data-quality model

The existing ingest pipeline and `ingest_runs` provide a foundation. The new EOD quality slice now validates duplicate/missing/bad-OHLC rows before writes, records explicit counters on the bhavcopy log, and records each bhavcopy attempt in service-only `job_runs`. Database application, RLS verification, and source/licensing confirmation remain before production use.

### P1 — explicit unplanned journal path and durable reviews

Manual and imported journal records now receive an explicit `unplanned` setup tag when no valid durable setup is linked, and legacy null tags have an additive backfill migration. Closed trades can now persist one owner-scoped `trade_reviews` record with plan adherence, mistakes, lesson, and follow-up fields; the journal review queue hydrates those records and older lesson writes are synchronized by a database trigger. Review-aware outcome analytics are implemented locally; applied-schema and live broker reconciliation evidence remain.

### P2 — read-only broker reconciliation

Broker adapters and read-only/import paths exist, and the durable setup spine plus normalized broker lifecycle timeline are now in place. Pending fills can be manually reconciled and are rechecked by the UI while the activity page is open; owner-scoped audit events record read-only checks, imports, submissions, failures, and reconciliation. Applied-schema verification and owner-approved real-account smoke remain.

### P2 — live execution and post-trade intelligence

Explicit confirmation, server-only credentials, idempotency, broker status, fill reconciliation, and durable audit logging are now implemented as a locally verified execution foundation. Live execution remains disabled by default and requires applied migration/RLS checks, owner-approved real-account testing, and separate production enablement. Post-trade reviews and intelligence consume the same setup id and should not be built on a second symbol-keyed identity. The first intelligence slice now supports date-bounded realized-R metrics and scanner/sector/holding-period cohorts, while MAE/MFE and benchmark attribution remain blocked by missing intratrade path data and an unapproved attribution definition.

## Plan-to-repository map

| Attached phase | Current evidence | Gap | Recommended next state |
| --- | --- | --- | --- |
| Stabilize/audit | Existing app, docs, migrations, tests | No factual audit packet for this implementation | This audit packet |
| Shared domain model | Workflow state and journal fields | No durable setup entity | Add setup foundation |
| EOD pipeline | Ingest routes, `ingest_runs`, and bhavcopy log | New quality/job contract still needs database-backed verification | Apply and verify the additive migration |
| Scanner builder | Scanner UI/API and saved screens | Missing explicit candidate lineage | Add candidate model and explainability |
| Chart/setup | Chart plan and decision desk | Handoff is local-draft plus symbol state | Persist setup and link handoff |
| Rulebook | Plan fields and broker checks | No reusable rule evaluation model | Attach evaluations to setup |
| Watchlist/journal | Watchlist, workflow, manual/simulated journal, explicit unplanned tagging, durable trade reviews | Imported-fill reconciliation and review-aware analytics remain | Link every fill to setup and measure review outcomes |
| Zerodha read-only | Broker adapters/import surfaces | Fresh external verification required | Verify read-only path |
| Execution | Simulated/order-intent safety foundation | Live execution owner-gated | Do not enable in this slice |
| Review intelligence | Journal and AI review surfaces | Review lineage is incomplete | Build after setup/fill lineage |
