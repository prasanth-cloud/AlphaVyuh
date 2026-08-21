# Decision 017 — Persist EOD scanner lineage

Status: accepted for the current implementation slice.

## Decision

Persist each authenticated completed scanner execution as a user-owned `scanner_runs` row and persist the ranked, capped result set as `scanner_candidates`. Store match reasons, confidence reasons, data warnings, and a compact EOD result snapshot. Return `scan_run_id` and `candidate_id` to the scanner client, then carry the candidate id into `setups.source_scanner_candidate_id`.

## Rationale

The scanner already computes useful explainability fields, but the previous path copied them into symbol-keyed workflow context and lost the identity of the actual run. A durable run and candidate identity lets a trader reopen what a scan found on a specific EOD date and lets later setup, journal, and review records reference the same idea.

The shared in-process market-result cache must not contain user-owned ids. Cache hits therefore create a fresh user-scoped lineage record from the cached market rows, and only the authenticated response receives the new ids.

## Boundaries

- Lineage is recorded for authenticated UI scans; internal saved-alert scans remain compatible and do not create a user run for the grouped alert execution.
- Only the plan-capped ranked rows are persisted, not an unbounded universe result.
- The snapshot is evidence for the EOD scan, not a live quote or recommendation.
- The new migration must be applied and RLS-tested in the correct Supabase project before production claims are made.

## Follow-up

Replace the saved-screen JSON editor with the normalized definition/group/filter builder after external database access is restored. The first EOD quality counters and service-only job-run evidence now live in Decision 018.
