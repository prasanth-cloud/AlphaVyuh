# Agent mission control run

Date: 2026-05-17

Issue: https://github.com/prasanth-cloud/AlphaVyuh/issues/126

## Agents

- Product Agent: defined the founder-readable control surface and warned against turning it into a second project-management system.
- Frontend Agent: recommended an authenticated `/agents` route, static no-secret data, and account-menu/search discoverability instead of main-nav clutter.
- QA Agent: identified auth, layout, overflow, runtime-error, and secret-exposure checks.

## Done

- Added `/agents` as an authenticated Agent Mission Control page.
- Added static mission-control data for agent lanes, shipped PRs, blockers, cross-agent requests, and next actions.
- Added account-menu and command-search entry points without adding a trader-facing main-nav item.
- Added unit and Playwright coverage for the new surface.

## Why

AlphaVyuh development is moving toward a manager-agent plus worker-agent operating model. The founder needs one place to scan what agents are doing, what shipped, what is blocked, and what should happen next without reading long chat logs.

## Learned

- The most useful first version is read-only and static. Runtime GitHub/Supabase integrations can come later, but would add token and stale-data risk too early.
- The page should stay operational and founder-facing; the main trader nav should remain focused on Dashboard, Scanner, Watchlist, and Journal.
- Migration-gated PRs #122 and #123 remain blocked because the available production DB URL fails authentication in this environment.

## Improve Next

- Add a backend or scheduled sync source for PR/issue metadata once the authorization model is explicit.
- Add a founder-only role check before showing more sensitive operational detail.
- After migrations land, update blockers automatically from PR status rather than static copy.

## Validation

- `npm --prefix frontend run test -- --run tests/unit/agent-mission-control.test.ts`
- `npm run typecheck`
- `npm --prefix frontend exec -- playwright test --config=frontend/playwright.mock.config.ts frontend/tests/e2e/agents.spec.ts`
- `npm run lint`
- `npm --prefix frontend run test -- --run`
- `cd frontend && npm exec -- playwright test tests/e2e/auth.spec.ts --grep "/agents redirects"`
- `npm run test:e2e:layout`
- `npm run test:e2e:mock`
- `npm run test:e2e:perf`
- `npm audit --audit-level=moderate`
- `git diff --check`

Visual smoke:
- Local mock `/agents` returned 200.
- Heading was visible.
- Horizontal overflow was `0`.
- Console/page errors were empty.
- Screenshot: `/tmp/alphavyuh-agents-mission-control.png`
