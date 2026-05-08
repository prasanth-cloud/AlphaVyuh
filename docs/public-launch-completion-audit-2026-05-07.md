# Public Launch Completion Audit — 2026-05-07

This file maps the full public-launch prompt to concrete artifacts on branch
`launch/public-release-readiness-2026-05-07`.

## Success Criteria Audit

| Requirement | Evidence | Status |
| --- | --- | --- |
| Use the real GitHub repo `prasanth-cloud/AlphaVyuh`. | Git remote is `https://github.com/prasanth-cloud/AlphaVyuh.git`; open PR state was inspected with GitHub tooling/CLI during this refresh. | Done |
| Work on branch `launch/public-release-readiness-2026-05-07`. | Branch exists locally and on origin. | Done |
| Use `github:github` to resolve repo state. | GitHub repo metadata and PR state were inspected; stale open PRs are documented in `docs/public-launch-readiness-2026-05-07.md`. | Done |
| Use `codex-security:security-scan`. | The exact plugin/skill is not active in this Codex session. A local cached skill-guided manual fallback scan is documented in `docs/security-codex-scan-2026-05-07.md`; the older launch scan remains at `docs/security-launch-scan-2026-05-07.md`. | Blocked by environment |
| Inspect `PRODUCT.md`, `BETA_LAUNCH_CHECKLIST.md`, `docs/release-readiness.md`, `docs/customer-launch-runbook.md`, and recent launch audit files. | Findings are summarized in `docs/public-launch-readiness-2026-05-07.md`; stale Next.js note was corrected in `docs/release-readiness.md`. | Done |
| Create public launch readiness audit with P0/P1/P2/owner gates. | `docs/public-launch-readiness-2026-05-07.md`. | Done |
| Implement high-confidence P0/P1 fixes. | `/dev-login` gating, generic backend auth failure detail, broker smoke token-print guard. | Done |
| Fix high/critical security findings. | No high/critical validated by the fallback scan. Three medium findings were fixed. | Done |
| Run frontend lint. | `npm run lint` passed. | Done |
| Run frontend typecheck/build. | `npm run typecheck` passed and includes Next.js production build; `npm run launch:check` also ran production build. | Done |
| Run frontend unit tests. | `npm --prefix frontend run test -- --run` passed: 13 files, 47 tests. | Done |
| Run frontend audit. | `npm audit --audit-level=moderate` passed: 0 vulnerabilities. | Done |
| Run backend tests. | `backend/.venv/bin/python -m pytest backend/tests` passed: 169 tests. | Done |
| Run backend dependency audit. | `backend/.venv/bin/python -m pip_audit -r backend/requirements.txt --disable-pip --no-deps --progress-spinner off` passed. | Done |
| Run mock workflow E2E. | `npm run test:e2e:mock` passed: 9 tests. | Done |
| Run layout smoke. | `npm run test:e2e:layout` passed: 12 tests. | Done |
| Run performance smoke. | `npm run test:e2e:perf` passed: 2 tests. | Done |
| Run release-readiness checks. | `npm run launch:check` passed in this refresh, including production build, mock workflow, perf/layout smoke, backend HTTP smoke, backend focused tests, frontend audit, and backend dependency audit. | Done |
| Update launch docs with exact evidence. | `docs/public-launch-readiness-2026-05-07.md`, `docs/security-codex-scan-2026-05-07.md`, `docs/security-launch-scan-2026-05-07.md`, and this file. | Done |
| Commit with conventional message. | Branch contains conventional launch-readiness documentation commits and was refreshed with latest `main`, including merged scanner PR #73. | Done |
| Push branch and open draft PR. | Draft PR #74: https://github.com/prasanth-cloud/AlphaVyuh/pull/74. | Done |

## Public Launch Surface Audit

| Surface | Evidence | Status |
| --- | --- | --- |
| Landing/pricing/signup/login/reset/onboarding render and remain beta-safe. | Public route E2E and layout smoke passed; launch copy review in `docs/public-launch-readiness-2026-05-07.md`. | Done for beta posture |
| Dashboard/scanner/watchlist/charts/journal/settings/data page work in mock workflow. | `test:e2e:mock`, `test:e2e:layout`, and `test:e2e:perf` passed. | Done for local/mock |
| Terms/privacy/policies avoid advice/guaranteed-return language. | Repo-wide copy scan documented in `docs/security-codex-scan-2026-05-07.md` and `docs/security-launch-scan-2026-05-07.md`. | Done |
| Data provenance visible and not confused with live data. | Existing E2E coverage checks provenance across dashboard/scanner/watchlist/full chart/data page. | Done |
| Broker execution cannot accidentally place live orders. | Backend order safety tests passed; live/sandbox execution remains disabled unless explicit backend flag and user confirmation are present. | Done |
| Billing/Razorpay safely enabled or disabled. | Billing UI remains disabled/waitlist-gated; Razorpay checkout is not production-enabled. | Done for disabled posture |
| Supabase migrations reviewed and production-safe. | Repo migration docs reviewed; read-only production advisors were run. `supabase/migrations/20260508001000_public_launch_security_hardening.sql` is prepared for function search-path/direct-execute hardening, but the Supabase migration API refused the production apply. The repo deploy script was made macOS Bash 3 compatible; staging preflight fails DNS and production preflight fails DB auth with current local URLs. | Apply pending |
| Security-sensitive flows reviewed. | Auth, redirects, service keys, broker credentials, payment webhooks, rate limits, public API exposure, and dependency posture are covered by scan docs and tests. | Done for repo-local evidence |

## Remaining Owner-Controlled No-Go Items

These are outside autonomous repo work and prevent marking the app as a paid full-public-launch candidate:

1. Approved production market-data/vendor redistribution terms.
2. Final public-launch legal/support copy.
3. Razorpay production checkout approval with webhook, refund/cancel, failed-payment, and owner sign-off evidence.
4. Owner-provided Kite/Upstox tokens for read-only smoke, if broker validation is desired.
5. Valid staging/prod Supabase DB URLs or a Supabase dashboard apply path for the prepared hardening migration.
6. Apply/verify `supabase/migrations/20260508001000_public_launch_security_hardening.sql` for function search paths and direct EXECUTE grants in staging/prod, then add post-apply advisor evidence.
7. A real activated `codex-security:security-scan` run, if that skill becomes available in the environment.

## Conclusion

The repo validation work is refreshed and remains green for private/founder beta posture. The full public launch objective is not complete because the remaining no-go items require owner input or unavailable tooling. The safe release recommendation is to continue founder/private beta until those gates are resolved.
