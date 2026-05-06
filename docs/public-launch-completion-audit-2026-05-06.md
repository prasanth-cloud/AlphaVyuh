# AlphaVyuh Public Launch Completion Audit

Date: 2026-05-06
Branch: `launch/auth-workflow-data-hardening`
PR: #62

## Objective

Finish the remaining non-gated public launch hardening after PR #61, and clearly separate completed launch work from owner-gated release decisions.

## Completion Checklist

| Requirement | Evidence | Status |
| --- | --- | --- |
| Verify PR #62 health | `gh pr view 62` shows open, non-draft, `mergeStateStatus: CLEAN`, Vercel success, head `b5b8843`. | Complete |
| Auth gate works | Non-mock-auth Playwright auth suite on localhost:3006: 18 passed. Protected `/dashboard`, `/scanner`, `/journal`, `/settings` redirect to `/login`. | Complete |
| Public legal routes work before login | `frontend/tests/e2e/auth.spec.ts` covers `/privacy` and `/terms` pre-login. Legal pages moved to `frontend/app/privacy/page.tsx` and `frontend/app/terms/page.tsx`. | Complete |
| Signup/login/reset/onboarding are launch-safe | PR #62 implements signup to onboarding, dark reset/dev-login, safe `next` preservation, starter watchlist focus. Covered by `auth.spec.ts` and `workflow-mock.spec.ts`. | Complete |
| Open redirects are blocked | `frontend/lib/safe-redirect.ts`; unit/browser tests reject protocol-relative, encoded protocol-relative, backslash, encoded backslash, malformed/control vectors. | Complete |
| Data provenance is visible | `frontend/tests/e2e/workflow-mock.spec.ts` checks dashboard, scanner, watchlist, full chart, and data page for Demo/EOD/source/freshness messaging. | Complete |
| Core workflow works in mock mode | `npm run test:e2e:mock`: signup -> onboarding -> watchlist, scanner -> shortlist -> watchlist -> Decision Desk -> mock order -> journal draft, drawings, risk/reward, zone notes. | Complete |
| Decision Desk/order gate remains safe | Mock workflow e2e verifies invalid plans keep Ready/order disabled and valid simulated orders create journal drafts. Backend focused broker safety tests passed. | Complete |
| Journal learning loop is visible | `frontend/app/(app)/journal/page.tsx` now shows review/source queue. `workflow-mock.spec.ts` checks review queue and source labels. | Complete |
| Billing launch posture is clear | `frontend/app/(app)/settings/page.tsx` now blocks checkout unless production Razorpay config exists and labels founder beta access. `layout-smoke.spec.ts` verifies disabled posture. | Complete |
| Dark launch visual system has no obvious leakage | Legal pages now use dark public framing. `npm run test:e2e:layout` covers workflow pages plus `/privacy`, `/terms`, `/settings?tab=billing`, and launch routes for overflow/console errors. | Complete |
| Performance smoke remains within mock budgets | `npm run test:e2e:perf`: 2 passed. Prior local timing evidence: mock login -> dashboard usable 266 ms. | Complete |
| Dependency/security checks | `npm audit --audit-level=moderate`: 0 vulnerabilities. `backend/.venv/bin/python -m pip_audit -r backend/requirements.txt`: no known vulnerabilities. Secret/token search found only expected env examples/tests/server-side paths. | Complete |
| Backend focused tests | `backend/.venv/bin/python -m pytest backend/tests/test_auth_middleware.py backend/tests/test_broker_order_safety.py backend/tests/test_brokers_router.py backend/tests/test_market_context.py backend/tests/test_charts.py backend/tests/test_scanner_filters.py`: 50 passed, 2 existing deprecation warnings. | Complete |
| Final PR evidence | PR #62 comments include completion pass evidence and Vercel green/CLEAN status. | Complete |

## Validation Commands Run

```bash
npm run lint
npm run typecheck
npm --prefix frontend run test -- --run
npm audit --audit-level=moderate
backend/.venv/bin/python -m pip_audit -r backend/requirements.txt
backend/.venv/bin/python -m pytest backend/tests/test_auth_middleware.py backend/tests/test_broker_order_safety.py backend/tests/test_brokers_router.py backend/tests/test_market_context.py backend/tests/test_charts.py backend/tests/test_scanner_filters.py
npm run test:e2e:mock
npm run test:e2e:layout
npm run test:e2e:perf
PLAYWRIGHT_BASE_URL=http://localhost:3006 npm --prefix frontend exec -- playwright test --config=frontend/playwright.local.config.ts frontend/tests/e2e/auth.spec.ts
```

Observed results:

- Lint: passed.
- Typecheck: passed.
- Frontend unit suite: 42 passed.
- NPM audit: 0 vulnerabilities.
- Backend pip audit: no known vulnerabilities.
- Backend focused pytest: 50 passed, 2 existing deprecation warnings.
- Mock e2e: 9 passed.
- Layout e2e: 8 passed.
- Perf e2e: 2 passed.
- Non-mock-auth auth route suite: 18 passed.

## Owner-Gated Items Not Completed

These cannot be completed safely without owner input or credentials:

| Gate | Required owner input |
| --- | --- |
| Merge PR #62 | Explicit approval to merge this validated PR into `main`. |
| Public beta vs private beta | Confirm launch mode. Current product copy assumes founder/private beta where billing and broker execution stay gated. |
| Data policy | Confirm EOD/free-first launch or provide paid provider budget/contract terms. |
| Official legal/support copy | Confirm support/contact email and final privacy/terms/company/legal copy. Current copy is launch-safe but not lawyer-approved. |
| Billing production readiness | Confirm billing should remain disabled, hidden, or production-ready. Production checkout requires Razorpay live key, webhook secret, GST/refund/accounting decisions, and payment QA. |
| Final domain/deployment target | Confirm final production domain and deployment target. |
| Production Supabase changes | Explicit approval before touching production Supabase. Migration drift evidence for prior PR #60 is complete; no new schema change is in PR #62. |
| Real Kite/Upstox smoke | Owner-provided valid tokens and explicit approval for read-only smoke. No token should be printed or committed. |
| Live/sandbox broker order validation | Explicit account-owner confirmation for exact broker, mode, symbol, side, quantity, order type, and risk plan. |

## Go / No-Go Recommendation

Go for a non-paid founder/private beta using clearly labeled Demo/EOD data, disabled checkout, read-only/mock broker workflows, and simulated order-to-journal flow.

No-go for paid public launch until the owner-gated items above are resolved, especially production billing, legal copy, data vendor policy, production domain, and broker token/read-only validation.
