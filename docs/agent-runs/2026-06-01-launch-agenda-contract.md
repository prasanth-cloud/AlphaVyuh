# Launch Agenda Contract

## Scope
- Branch: `codex/launch-agenda-contract`
- Worktree: `/private/tmp/alphavyuh-launch-agenda-contract`
- Objective: make the next launch-confidence agenda visible inside AlphaVyuh without changing production data, billing, broker execution, or deployment state.

## Files Changed
- `frontend/lib/launch-agenda.ts`
- `frontend/tests/unit/launch-agenda.test.ts`
- `frontend/app/(app)/data/page.tsx`

## What Changed
- Added a reusable launch-agenda model that converts market data health, sector taxonomy status, broker order gate state, journal review coverage, and owner-gated launch decisions into explicit checklist cards.
- Added a Data Trust page `Launch contract` panel covering:
  - cash-equity EOD launch scope
  - market data trust
  - sector source/audit state
  - broker read-only boundary
  - decision-memory/journal coverage
  - owner-gated business decisions
- Kept execution boundaries explicit: no F&O/options/derivatives, no live order execution, no investment advice, and broker actions remain read-only/journal capture until owner-approved execution work lands.

## Tests Run
- `npm --prefix frontend run test -- tests/unit/launch-agenda.test.ts tests/unit/sector-taxonomy-copy.test.ts tests/unit/broker-safety.test.ts` -> 20 passed.
- `npm exec eslint 'app/(app)/data/page.tsx' lib/launch-agenda.ts tests/unit/launch-agenda.test.ts` from `frontend/` -> passed.
- `npm --prefix frontend run typecheck` -> passed.
- `npm run test:e2e:layout` -> 16 passed.
- `git diff --check` -> passed.

## Open Decisions
- Owner still needs to decide TradingView Advanced Charts licensing, data-vendor posture, billing/legal/support readiness, production Supabase mutation policy, and when broker execution can move beyond read-only evidence.

## Known Risks
- The panel makes launch readiness more visible, but it does not replace owner approval or external vendor/legal decisions.

## Next Steps
- Open and merge PR after checks pass.
- Continue with the next slices: deeper decision-loop polish and broker read-only evidence clarity.
