# Persistent Trade Idea Context Agent Run

## Goal

Make AlphaVyuh feel like one connected workflow by carrying scanner idea context into the watchlist Decision Desk and simulated journal draft path.

## Branch

`codex/persistent-trade-idea-context`

## Agents Used

| Agent | Work | Status | Evidence |
| --- | --- | --- | --- |
| Product | Recommended persistent scanner-to-journal idea context as the highest-value next sprint | Complete | Product Agent report in thread |
| Backend/Data | Identified scanner fields and recommended durable `scanner_context` shape | Complete | `frontend/lib/scanner-workflow.ts` |
| Frontend | Recommended compact placement in Decision Desk, not a new large panel | Complete | `frontend/app/(app)/watchlist/page.tsx` |
| QA | Recommended e2e/unit assertions for scanner -> chart -> journal path | Complete | `frontend/tests/e2e/workflow-mock.spec.ts`, unit tests |
| Manager | Implemented first non-migration slice and prepared PR | Complete | This report |

## Product Impact

- UX: traders now see the original scanner context in the Decision Desk while planning.
- Latency: no runtime API fan-out added.
- Data trust: scanner source/as-of/setup context survives the mock founder-beta flow.
- Reliability: tests prove context is preserved through lifecycle patches and simulated order drafts.
- Launch readiness: no production migration or owner-gated action required for this slice.

## Required Closeout

- Done: scanner watchlist actions now seed workflow state with scanner context; Decision Desk shows a compact Original scan block; simulated journal drafts include scanner context in the entry reason; unit and e2e tests cover the path.
- Why: founder-beta traders need to understand what they saw in the scanner, what they planned in watchlist/chart, and why the journal entry exists.
- Learned: the existing `WorkflowState` model was enough for a safe first slice; full durable Supabase persistence should come later with a JSONB migration.
- Improve next: add nullable `scanner_context` JSONB to `watchlist_items`, `workflow_states`, and `trade_journal` after owner-approved migration evidence is available.

## Validation

```text
git diff --check
npm run lint
npm run typecheck
npm run test
npm --prefix frontend run test -- --run tests/unit/workflow.test.ts tests/unit/mock-orders.test.ts
npm --prefix frontend exec -- playwright test --config=frontend/playwright.mock.config.ts frontend/tests/e2e/workflow-mock.spec.ts -g "scanner idea can become"
```

## Blockers

- Production persistence requires a Supabase migration and owner-controlled staging/prod evidence.
- Broker/live execution is intentionally untouched.

## Next Recommended Goal

Persist `scanner_context` through Supabase with nullable JSONB columns and add backend tests once the owner is ready to handle migration evidence.

