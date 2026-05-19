# Professional Access Copy Tightening - 2026-05-19

## Manager Agent

- Changed: continued the Professional Access cleanup after PR #171 merged and rechecked the production data recovery gate.
- Why: the product should read like an active professional platform even while the backend hosting recovery is still owner-gated.
- Learned: Supabase EOD data and Vercel production configuration are healthy; Railway hosting/auth remains the only data-recovery blocker.
- Remaining risk: production browser data cannot be fully verified until Railway backend deployment is restored.

## Product Copy Agent

- Changed: removed leftover visible "workspace" positioning from login, signup, public landing, access, 404, and Supabase auth email templates.
- Why: "account", "platform", and "focused flow" language is clearer and less beta/internal than repeated workspace phrasing.
- Learned: active public product pages were already clean for the major beta terms; the remaining issue was tone, not forbidden beta labels.
- Remaining risk: historical migration/docs comments still mention earlier beta programs, but they are not product UI.

## QA Agent

- Changed: expanded the public-posture checker to guard key product and auth files against legacy beta/workspace copy returning.
- Why: this makes future regressions visible in the same launch posture check instead of relying on manual screenshot review.
- Learned: the recovery preflight currently proves real EOD rows exist in Supabase, while Railway is returning its platform fallback 404.
- Remaining risk: the public posture check needs a `PUBLIC_SITE_URL` or `LIVE_URL` when validating a deployed site.

## Validation

- `node scripts/test-check-public-posture.mjs` passed.
- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm --prefix frontend run test -- --run` passed.
- `npm audit --audit-level=moderate` passed with 0 vulnerabilities.
- `backend/.venv/bin/python -m pip_audit -r backend/requirements.txt` passed with no known vulnerabilities.
- `backend/.venv/bin/python -m pytest backend/tests/test_auth_middleware.py backend/tests/test_charts.py backend/tests/test_scanner_filters.py backend/tests/test_market_overview_failsoft.py backend/tests/test_security_hardening.py` passed: 62 tests.
- `npm run test:e2e:mock` passed: 10 tests.
- `npm run test:e2e:layout` passed: 16 tests after rerunning sequentially to avoid a local port collision.
- `npm run test:e2e:perf` passed: 2 tests after rerunning sequentially.
- `PUBLIC_SITE_URL=https://www.alphavyuh.com npm run check:public-posture` currently fails because production has not deployed this copy change yet; preview/prod should be rechecked after merge.
- `npm run check:data-recovery` still fails only on Railway hosting/auth: production API returns Railway fallback 404, while Vercel env and Supabase EOD data pass.
