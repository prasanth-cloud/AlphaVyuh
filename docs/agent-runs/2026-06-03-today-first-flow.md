# Today-first flow PR

## Scope
- Relabel `/dashboard` as Today in user-facing navigation, command search, onboarding, not-found, and data recovery copy.
- Reposition Today so review due, active plans, watchlist focus, and data health appear before market pulse and market stats.
- Keep `/dashboard` as the route; no backend API, database, or Supabase mutations.
- Move sector taxonomy audit wording out of the Today trader workflow and keep the Data Status handoff.
- Soften the new Today first-viewport labels with normal casing and no letter spacing.

## Branch and Worktree
- Branch: `codex/today-first-flow`
- Worktree: `/private/tmp/alphavyuh-today-first-flow`
- Base: `origin/main` at `b83a04f fix(ci): isolate production smoke auth (#339)`

## Files Changed
- `frontend/app/(app)/dashboard/page.tsx`
- `frontend/components/AppShell.tsx`
- `frontend/components/Navbar.tsx`
- `frontend/app/(app)/data/page.tsx`
- `frontend/app/(app)/onboarding/page.tsx`
- `frontend/app/not-found.tsx`
- `frontend/app/globals.css`
- `frontend/lib/data-health-copy.ts`
- `frontend/lib/launch-agenda.ts`
- `frontend/tests/e2e/dashboard-unavailable.spec.ts`
- `frontend/tests/e2e/layout-smoke.spec.ts`
- `frontend/tests/e2e/performance-smoke.spec.ts`
- `frontend/tests/e2e/smoke-signed-in.spec.ts`
- `frontend/tests/unit/market-overview-api.test.ts`
- `frontend/tests/unit/today-copy-source.test.ts`

## Verification
- `npm --prefix frontend ci`
- `npm run test -- today-copy-source market-overview-api launch-agenda sector-taxonomy-copy scanner-detail-watchlist-feedback-source`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run test:e2e:layout`
- `npm run test:e2e:mock`
- `npm run test:e2e:perf`
- `python -m pytest backend/tests/test_daily_refresh_alerts.py backend/tests/test_market_dates.py backend/tests/test_market_breadth_snapshot.py`
- `git diff --check`
- Playwright visual smoke on `http://127.0.0.1:3100/dashboard` for desktop `1440x900` and mobile `390x844`: no horizontal overflow, nav order is Today/Journal/Watchlist/Scanner, market pulse is below Today cockpit, taxonomy copy is absent from first viewport, and Today cockpit labels have normal casing/no letter spacing.

## Open Decisions
- Broader typography cleanup should be a follow-up PR; this slice only softens the new Today first viewport.
- Data Status still intentionally keeps sector taxonomy audit details.

## Next Steps
- Open PR for this slice and use GitHub/Vercel checks as the merge gate.
- After merge, continue with landing/UI humanization, then Journal wedge, Watchlist/Chart handoff, Scanner handoff polish, and security scan.
