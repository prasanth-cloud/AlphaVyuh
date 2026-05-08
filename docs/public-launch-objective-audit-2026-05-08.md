# Public Launch Objective Completion Audit — 2026-05-08

Branch: `launch/public-release-readiness-2026-05-07`
PR: <https://github.com/prasanth-cloud/AlphaVyuh/pull/74>
Repository: `prasanth-cloud/AlphaVyuh`

## Objective Restated

Prepare AlphaVyuh as a full public launch candidate by using the real GitHub
repository, inspecting launch readiness, running a repository-wide security
review, fixing high-confidence launch/security issues, validating the app, and
opening a PR with evidence.

## Current Go / No-Go

**No-go for paid full public launch.** The branch is suitable as a reviewed
public-launch readiness PR, but the product must remain in founder/private beta
posture until owner-controlled gates are resolved.

## Prompt-To-Artifact Checklist

| Requirement | Evidence | Status |
| --- | --- | --- |
| Use the real GitHub repository `prasanth-cloud/AlphaVyuh`. | Local checkout remote and PR #74 target the real repo; GitHub PR/check state inspected with the GitHub connector plus `gh pr view` and `gh pr checks`. | Done |
| Work from latest real GitHub code. | Branch includes latest `origin/main` through merge commit `d40dd8c`, plus merged scanner commit `8d7369f`. | Done |
| Dedicated branch `launch/public-release-readiness-2026-05-07`. | Current branch and PR #74 use this branch. | Done |
| Inspect launch docs and current private-beta state. | `PRODUCT.md`, `BETA_LAUNCH_CHECKLIST.md`, `docs/release-readiness.md`, `docs/customer-launch-runbook.md`, and recent launch/security docs are summarized in `docs/public-launch-readiness-2026-05-07.md`. | Done |
| Create P0/P1/P2 public-launch readiness audit. | `docs/public-launch-readiness-2026-05-07.md`. | Done |
| Implement high-confidence P0/P1 fixes. | `/dev-login` production-like gating, generic backend auth failure detail, broker smoke token-print guard; documented in launch/security docs. | Done |
| Use `github:github`. | The GitHub connector was used on 2026-05-08 to inspect open PR state for `prasanth-cloud/AlphaVyuh`, including PR #74 and current branch/check evidence. Authenticated GitHub CLI calls (`gh pr view`, `gh pr checks`, `gh pr edit`, `gh pr comment`) were also used for check/body updates. | Done |
| Use exact `codex-security:security-scan`. | The installed Codex Security `security-scan` skill was active in the later session and was run repository-wide. The plugin-specific MCP tool name `codex-security:security-scan` was not exposed as a separate callable tool; evidence is documented at `docs/security-codex-scan-2026-05-08.md` and `/tmp/codex-security-scans/alphavyuh/5a013a85b444_20260508-084003/report.md`. | Done with activated installed skill |
| Do not claim exact Codex Security pass unless active. | The historical fallback report remains marked as fallback; the current report distinguishes the active installed skill workflow from the non-exposed plugin-specific MCP tool name. | Done |
| Repository-wide security report with threat model, discovery, validation, attack-path analysis, final findings. | `docs/security-codex-scan-2026-05-08.md` and `/tmp/codex-security-scans/alphavyuh/5a013a85b444_20260508-084003/`. | Done |
| Fix validated high/critical findings. | No high/critical finding survived validation. One medium ingest fail-open finding was fixed in `backend/app/routers/ingest.py` with `backend/tests/test_ingest_security.py`. | Done |
| Landing/pricing/signup/login/onboarding/app routes work. | `npm run launch:check`, release-readiness E2E, layout/perf/mock checks documented in `docs/public-launch-readiness-2026-05-07.md`. | Verified locally |
| No misleading advice, signal-service, fake, or guaranteed-return claims. | Copy scan and legal posture documented in security/readiness docs. Product remains educational/not-advice. | Verified for beta posture |
| Data provenance visibly labels EOD/demo/fallback/live-beta surfaces. | Existing layout/mock E2E and launch docs cover dashboard/scanner/watchlist/full chart/data surfaces. | Verified locally |
| Broker live/sandbox execution safely gated. | Backend order safety tests and release docs confirm flag + explicit confirmation gates; no live/sandbox order paths were run. | Done |
| Billing/Razorpay safely enabled or disabled. | Billing remains disabled/waitlist-gated; production checkout not enabled. | Done for disabled posture |
| Supabase migrations reviewed and production-safe. | Reviewed migration `supabase/migrations/20260508001000_public_launch_security_hardening.sql` applied to production via direct SQL execution on 2026-05-08 after owner authorization because staging was inactive and the migration API refused the apply. | Applied via direct SQL |
| Supabase production mutation evidence. | Post-apply verification shows targeted functions use `search_path=public` and grants are limited to `postgres`/`service_role`; post-apply security advisors no longer show the mutable search-path or security-definer direct-execute warnings. Migration history still needs reconciliation when DB URL access is restored. | Verified |
| Frontend lint. | `npm run lint` passed. | Done |
| Frontend typecheck/build. | `npm run typecheck` passed. | Done |
| Frontend unit tests. | `npm --prefix frontend run test -- --run` passed: 13 files / 47 tests. | Done |
| Frontend audit. | `npm audit --audit-level=moderate` passed: 0 vulnerabilities. | Done |
| Backend tests. | `backend/.venv/bin/python -m pytest backend/tests -q` passed after the ingest security fix: 175 tests. `npm run launch:check` backend focused tests also passed: 40 tests. | Done |
| Backend dependency audit. | `backend/.venv/bin/python -m pip_audit -r backend/requirements.txt --disable-pip --no-deps --progress-spinner off` passed. | Done |
| Mock workflow E2E. | `npm run test:e2e:mock` passed: 9 tests. | Done |
| Layout smoke. | `npm run test:e2e:layout` passed: 12 tests. | Done |
| Performance smoke. | `npm run test:e2e:perf` passed: 2 tests. | Done |
| Release-readiness checks. | `npm run launch:check` passed. | Done |
| Commit changes with conventional commits. | Branch includes conventional docs/security/db commits. | Done |
| Push branch and open draft PR. | PR #74 is open, draft, mergeable; Vercel green. | Done |

## Current PR Check State

- Vercel: green.
- Migration Drift Check: green.
- PR state: open draft, mergeable.

## Remaining Owner-Controlled Gates

1. Reconcile Supabase migration history when valid DB URL access is restored.
2. Enable Supabase Auth leaked-password protection in the project dashboard.
3. Provide final public-launch legal/support/data-vendor policy.
4. Keep Razorpay production checkout disabled until owner-approved production
   payment evidence exists.
5. Provide owner broker tokens only if real read-only Kite/Upstox smoke is
   desired; do not run live/sandbox order validation without explicit owner
   confirmation.
6. Add Telegram webhook secret validation before broad Telegram bot promotion.

## Exact Next Action

Reconcile Supabase migration history when valid DB URL access is restored, then
continue owner-controlled public-launch gates: Auth leaked-password protection,
final legal/support/data-vendor policy, Razorpay production payment evidence,
optional read-only broker smoke credentials, and Telegram webhook secret
validation before public bot promotion.
