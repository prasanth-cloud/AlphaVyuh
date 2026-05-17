# Live Journal Idea Context

Date: 2026-05-17
Branch: `codex/live-journal-idea-context`
Issue: #118

## Agent Roster

- Manager: integrated the backend, frontend, migration, validation, and PR handoff.
- Product Agent Linnaeus: defined the structured idea-context fields that are useful to traders without persisting secrets, raw broker payloads, or advice.
- Backend/Data Agent Harvey: mapped the live persistence gap across journal, broker order creation, workflow state, Supabase schema, and API types.
- QA Agent Leibniz: identified backend round-trip, broker-order parity, migration, and reload/regression coverage needed to prevent mock/live drift.

## What Changed

- Live journal create/update now accepts and persists `source_page`, `source_context`, `scanner_context`, `thesis`, and `invalidation_rule`.
- Simulated chart/watchlist orders now merge scanner and plan context from the request and saved workflow state before creating journal rows.
- Workflow state patches can persist `scanner_context`, so scanner-origin ideas can survive into later order and journal flows.
- Watchlist order placement forwards the active plan scanner context instead of relying only on mock/local state.
- Supabase migration `039_journal_idea_context.sql` adds the missing journal/workflow columns and JSON/object constraints.
- Supabase frontend types and API request types now include the structured idea-context fields.
- Backend tests cover journal context create/update, migration shape, and broker order journal parity.

## Why

The previous journal review feature worked well in mock mode, but live users could still lose the original scanner/plan context when rows were saved through the backend. This closes that gap so AlphaVyuh can review the actual decision a trader made, not just the final P&L.

## What We Learned

- Mock mode was ahead of production persistence; the backend was silently dropping several fields the UI already understood.
- Broker/order journal rows need to read workflow state because the order request may not carry every original idea field.
- A small structured snapshot is better than storing large scanner dumps or raw broker responses.
- The migration must land in order after the scan-alert migration from PR #122, or be rebased if #122 is delayed.

## Improve Next

- Apply and verify PR #122 migration first, then apply `039_journal_idea_context.sql` for this PR.
- Add a Supabase RLS SQL test for journal context once the local Supabase CLI is available in this environment.
- Add a live-backend browser smoke after staging/prod migration evidence exists.
- Turn the persisted original idea context into a lightweight review-completion flow with saved lesson tags.

## Validation

- `npm run lint`
- `npm run typecheck`
- `backend/.venv/bin/python -m pytest backend/tests/test_journal_context.py backend/tests/test_broker_order_safety.py`
- `backend/.venv/bin/python -m pytest backend/tests/test_journal_context.py backend/tests/test_broker_order_safety.py backend/tests/test_trade_analysis.py backend/tests/test_security_hardening.py`
- `npm --prefix frontend run test -- --run tests/unit/mock-orders.test.ts tests/unit/journal-review-context.test.ts`
- `npm --prefix frontend run test -- --run`
- `npm audit --audit-level=moderate`
- `backend/.venv/bin/python -m pip_audit -r backend/requirements.txt`
- `npm run test:e2e:mock`
- `npm run test:e2e:layout`
- `npm run test:e2e:perf`
- `git diff --check`

## Notes

- The Supabase CLI is not installed in this local environment, so the migration was created manually using the repo's numbered sequence.
- This PR is expected to trip the migration drift gate until the migration is applied and verified in the owner-controlled Supabase project.
