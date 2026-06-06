# Onboarding Cash-Equity Scope Polish

## Scope
- Removed first-run onboarding choices that implied unsupported non-cash-equity workflows.
- Replaced the trade-scope question with a single NSE/BSE cash-equity option and clear launch-scope copy.
- Added regression checks so onboarding continues to show cash-equity scope without reintroducing unsupported instrument choices.

## Branch / Worktree
- Branch: `codex/onboarding-cash-equity-scope`
- Worktree: `/private/tmp/alphavyuh-onboarding-cash-equity`

## Files Changed
- `frontend/app/(app)/onboarding/page.tsx`
- `frontend/tests/unit/onboarding-scope-copy.test.ts`
- `frontend/tests/e2e/layout-smoke.spec.ts`
- `docs/agent-runs/2026-06-01-onboarding-cash-equity-scope.md`

## Tests Run
- `npm --prefix frontend run test -- tests/unit/onboarding-scope-copy.test.ts`
- `npm exec eslint 'app/(app)/onboarding/page.tsx' tests/e2e/layout-smoke.spec.ts tests/unit/onboarding-scope-copy.test.ts`
- `npm --prefix frontend run typecheck`
- `npm run e2e:layout`
- `git diff --check`

## Open Decisions
- Decide whether future onboarding should ask for trading style within cash equities, such as swing, positional, or long-term, instead of instrument class.

## Known Risks
- This is onboarding scope polish only; it does not change backend profile fields or historical users who previously selected another value.

## Next Steps
- Open a PR and wait for hosted checks.
- After merge, use the merged PR set as the launch-confidence baseline for the next production deployment decision.
