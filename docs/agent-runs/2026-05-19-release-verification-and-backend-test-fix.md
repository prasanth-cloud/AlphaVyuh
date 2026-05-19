# Release Verification And Backend Test Fix

## Goal

Run the remaining release and security checks that do not require Railway
credentials, fix actionable local failures, and keep the production recovery
blocker precise.

## Agent Report

| Agent | Changed | Why it improves the product | Learned | Remaining risk |
| --- | --- | --- | --- | --- |
| QA Agent | Fixed two backend migration tests so they resolve Supabase migration files from the repository root even when pytest is launched from `backend/`. | Backend-focused tests now pass in the same working directory an engineer or CI job naturally uses. | The product code was fine; the failing evidence came from brittle test paths. | This does not change production behavior. |
| Security Agent | Ran npm and Python dependency audits. | Confirms this release slice did not inherit known moderate-or-higher dependency issues. | Both dependency audit surfaces are currently clean. | Dependency advisories can change over time and should stay in the release loop. |
| Frontend QA Agent | Ran frontend unit, typecheck, mock workflow, layout, and performance gates. | Confirms Professional Access copy, UI layout, workflow, and perf checks remain healthy while Railway is blocked. | The frontend is ready for post-Railway production smoke. | Real-data browser smoke still needs the Railway API restored. |
| Backend Recovery Agent | Re-ran `npm run check:data-recovery` and local `railway whoami`. | Confirms the no-data issue remains API hosting/auth, not Supabase data absence or Vercel env drift. | Vercel production env and Supabase EOD rows pass; Railway still returns fallback 404 and local auth is expired. | Owner must complete Railway login or provide Railway GitHub secrets. |

## Validation

- `npm audit --audit-level=moderate` passed.
- `npm --prefix frontend run test -- --run` passed: 21 files, 76 tests.
- `cd backend && .venv/bin/pytest` passed after the test-path fix: 236 tests.
- `cd backend && .venv/bin/pip-audit` passed.
- `npm run test:e2e:layout` passed: 16 tests.
- `npm run test:e2e:perf` passed: 2 tests.
- `npm run test:e2e:mock` passed: 10 tests.
- `npm run typecheck` passed.
- `PUBLIC_SITE_URL=https://www.alphavyuh.com npm run check:public-posture` passed.
- `npm run check:data-recovery` remains expected to fail on Railway recovery
  while Vercel env and Supabase EOD data pass.

## Current Blocker

Production data recovery is still gated by Railway. Run:

```bash
npm run recover:railway-backend:login
```

Then complete Railway activation and rerun:

```bash
npm run check:data-recovery
npm run test:e2e:prod:smoke
```
