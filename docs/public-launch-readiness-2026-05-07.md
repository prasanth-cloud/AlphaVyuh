# AlphaVyuh Public Launch Readiness Audit — 2026-05-07

Branch: `launch/public-release-readiness-2026-05-07`
Repository: `prasanth-cloud/AlphaVyuh`
Scope: latest GitHub `main` after the private-beta release work, reviewed as a candidate for broader public launch.

## Recommendation

**No-go for paid full public launch today.** AlphaVyuh is suitable for controlled founder/private beta posture, but full public launch remains blocked by owner-controlled commercial, legal, data, and production-operations gates.

The product should continue to say:

- private/founder beta
- EOD/free-first market data
- broker import/read-only only
- execution disabled in product
- educational workflow and journal tool, not investment advice
- billing disabled or waitlist-gated

## P0 Blockers

These block broad paid public launch and require owner-controlled evidence before removal.

| Area | Blocker | Evidence / required action |
| --- | --- | --- |
| Market data | Production redistribution/vendor policy is not finalized. | `PRODUCT.md` and `docs/customer-launch-runbook.md` still mark paid/live vendor terms as owner-gated. Launch copy must not claim live or realtime data. |
| Billing | Production Razorpay checkout is intentionally disabled. | Settings billing has `checkoutEnabled = false`; launch requires Razorpay keys, webhook signature evidence, refund/cancel path, failed-payment path, and owner approval. |
| Broker execution | Live/sandbox order placement is disabled and must stay gated. | Backend rejects live-confirmed orders unless `BROKER_LIVE_ORDERS_ENABLED=true`; no owner-provided broker tokens or explicit live/sandbox order confirmation were provided. |
| Legal/compliance | Public-launch legal copy, support policy, and market-data disclaimers need owner sign-off. | Current copy is beta-safe and educational, but not a final paid public-launch legal package. |
| Production Supabase | Production mutation remains unapproved. | Read-only staging advisors were run; repo now includes a reviewed hardening migration. Production application still requires owner approval. |

## P1 Launch Hardening Fixed In This Pass

| Area | Finding | Fix |
| --- | --- | --- |
| Auth surface | `/dev-login` was listed as a public route. It still required a Supabase token, but the route name and public exposure were inappropriate for production-like traffic. | `/dev-login` is now available only when mock app auth is enabled; otherwise it redirects to `/login`. |
| Auth error leakage | Backend auth fallback returned provider exception text in the 401 response. | Auth fallback now returns the generic message `Authentication failed`; a regression test covers this. |
| Broker smoke scripts | Kite/Upstox read-only smoke scripts had an explicit `--print-access-token` switch. | Full token printing now requires `ALLOW_PRINT_ACCESS_TOKEN=true`; default and documented behavior remains masked. |
| Supabase advisor security | Read-only staging advisors found public/signed-in EXECUTE grants on `SECURITY DEFINER` functions and mutable function search paths. | Added `supabase/migrations/20260507111500_launch_advisor_security_hardening.sql` to revoke direct browser/API execution for backend-only RPCs and set stable function search paths. |

## P2 Post-Launch Improvements

- Replace redirect shims such as `/settings/billing` with direct tab URLs when the billing surface is revisited.
- Add production observability dashboards for signup, scanner, watchlist, chart, journal, and feedback funnel events.
- Add Supabase advisor evidence to each production schema-changing PR.
- Add paid data provider adapter only after vendor terms, cost, and redistribution rules are confirmed.

## Open PR / Branch State

Open GitHub PRs observed during this pass:

- `#41` landing page: conflicting and superseded by current landing work.
- `#22` chart-library ADR: mergeable, but inconsistent with the current hard constraint to keep `lightweight-charts`.
- `#21` authenticated screen strip removal: conflicting and superseded by recent UI cleanup PRs.
- `#17` ingest sprint: conflicting and has a failing migration drift check.

None were merged as part of this pass.

## Validation Evidence

| Check | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed; includes Next.js production build through the repo script. |
| `npm --prefix frontend run test -- --run` | Passed: 13 files, 47 tests. |
| `npm audit --audit-level=moderate` | Passed: 0 vulnerabilities. |
| `backend/.venv/bin/python -m pytest backend/tests` | Passed: 169 tests. |
| `backend/.venv/bin/python -m pip_audit -r backend/requirements.txt --disable-pip --no-deps --progress-spinner off` | Passed: no known vulnerabilities found. |
| `npm run test:e2e:mock` | Passed: 9 workflow tests. |
| `npm run test:e2e:layout` | Passed: 12 layout/public-posture tests. |
| `npm run test:e2e:perf` | Passed: 2 performance smoke tests; mock login dashboard usable test completed in 666 ms in this local run. |
| `PLAYWRIGHT_BASE_URL=http://localhost:3011 npm --prefix frontend exec -- playwright test --config=frontend/playwright.local.config.ts frontend/tests/e2e/release-readiness.spec.ts` | Passed: 6 production-like public/auth-boundary tests, including `/dev-login` redirect. |
| `npm run launch:check` | Passed on elevated rerun. First sandbox run reached browser smoke then failed to bind local port 3002 with `EPERM`; rerun with local-server permission completed successfully. |

Read-only broker smoke was skipped because no owner-provided Kite/Upstox tokens were supplied. Live URL check was skipped because `LIVE_URL` was not set for this local branch validation.

Read-only Supabase advisor checks were run against the documented staging project
`fyxltykqdvacbdgmeucf`. Security advisors returned WARN-level findings for
mutable search paths and direct execution grants on security-definer functions;
the branch adds a reviewed migration for those repo-fixable items. Performance
advisors also returned unindexed foreign keys, auth RLS init-plan warnings,
duplicate indexes, and multiple permissive policy warnings; those are tracked as
post-launch database hardening unless they block load testing.
