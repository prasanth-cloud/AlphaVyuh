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
| Use the real GitHub repository `prasanth-cloud/AlphaVyuh`. | Local checkout remote and PR #74 target the real repo; GitHub PR/check state inspected with `gh pr view` and `gh pr checks`. | Done |
| Work from latest real GitHub code. | Branch includes latest `origin/main` through merge commit `d40dd8c`, plus merged scanner commit `8d7369f`. | Done |
| Dedicated branch `launch/public-release-readiness-2026-05-07`. | Current branch and PR #74 use this branch. | Done |
| Inspect launch docs and current private-beta state. | `PRODUCT.md`, `BETA_LAUNCH_CHECKLIST.md`, `docs/release-readiness.md`, `docs/customer-launch-runbook.md`, and recent launch/security docs are summarized in `docs/public-launch-readiness-2026-05-07.md`. | Done |
| Create P0/P1/P2 public-launch readiness audit. | `docs/public-launch-readiness-2026-05-07.md`. | Done |
| Implement high-confidence P0/P1 fixes. | `/dev-login` production-like gating, generic backend auth failure detail, broker smoke token-print guard; documented in launch/security docs. | Done |
| Use `github:github`. | The named skill was not available as an activated skill in this session; GitHub state was inspected and updated through authenticated GitHub CLI calls (`gh pr view`, `gh pr checks`, `gh pr edit`, `gh pr comment`). | Fallback used |
| Use exact `codex-security:security-scan`. | Exact activated plugin/skill was unavailable. Manual cached skill-guided fallback is documented at `docs/security-codex-scan-2026-05-07.md`. | Blocked by environment |
| Do not claim exact Codex Security pass unless active. | PR #74 and security docs explicitly say the exact activated scan was unavailable and must not be treated as a pass. | Done |
| Repository-wide security report with threat model, discovery, validation, attack-path analysis, final findings. | `docs/security-codex-scan-2026-05-07.md` and `docs/security-launch-scan-2026-05-07.md`. | Done via fallback |
| Fix validated high/critical findings. | No high/critical finding was validated in fallback scan. Medium fixes were completed and documented. | Done |
| Landing/pricing/signup/login/onboarding/app routes work. | `npm run launch:check`, release-readiness E2E, layout/perf/mock checks documented in `docs/public-launch-readiness-2026-05-07.md`. | Verified locally |
| No misleading advice, signal-service, fake, or guaranteed-return claims. | Copy scan and legal posture documented in security/readiness docs. Product remains educational/not-advice. | Verified for beta posture |
| Data provenance visibly labels EOD/demo/fallback/live-beta surfaces. | Existing layout/mock E2E and launch docs cover dashboard/scanner/watchlist/full chart/data surfaces. | Verified locally |
| Broker live/sandbox execution safely gated. | Backend order safety tests and release docs confirm flag + explicit confirmation gates; no live/sandbox order paths were run. | Done |
| Billing/Razorpay safely enabled or disabled. | Billing remains disabled/waitlist-gated; production checkout not enabled. | Done for disabled posture |
| Supabase migrations reviewed and production-safe. | Reviewed migration `supabase/migrations/20260508001000_public_launch_security_hardening.sql` prepared for function search-path/direct-execute hardening. | Prepared, not applied |
| Supabase production mutation evidence. | Supabase migration API refused production apply. Repo deploy preflight fails staging DNS and production DB auth with current local URLs. PR #74 intentionally does not include production-applied evidence. | Blocked |
| Frontend lint. | `npm run lint` passed. | Done |
| Frontend typecheck/build. | `npm run typecheck` passed. | Done |
| Frontend unit tests. | `npm --prefix frontend run test -- --run` passed: 13 files / 47 tests. | Done |
| Frontend audit. | `npm audit --audit-level=moderate` passed: 0 vulnerabilities. | Done |
| Backend tests. | `backend/.venv/bin/python -m pytest backend/tests` passed: 169 tests. | Done |
| Backend dependency audit. | `backend/.venv/bin/python -m pip_audit -r backend/requirements.txt --disable-pip --no-deps --progress-spinner off` passed. | Done |
| Mock workflow E2E. | `npm run test:e2e:mock` passed: 9 tests. | Done |
| Layout smoke. | `npm run test:e2e:layout` passed: 12 tests. | Done |
| Performance smoke. | `npm run test:e2e:perf` passed: 2 tests. | Done |
| Release-readiness checks. | `npm run launch:check` passed. | Done |
| Commit changes with conventional commits. | Branch includes conventional docs/security/db commits. | Done |
| Push branch and open draft PR. | PR #74 is open, draft, mergeable; Vercel green. | Done |

## Current PR Check State

- Vercel: green.
- Migration Drift Check: failing by design until production migration evidence is
  real.
- PR state: open draft, mergeable.

## Remaining Owner-Controlled Gates

1. Apply and verify
   `supabase/migrations/20260508001000_public_launch_security_hardening.sql`
   in staging/prod with valid Supabase DB access or an approved dashboard path.
2. Re-run Supabase security advisors and record post-apply evidence.
3. Add the production-applied PR marker only after the migration is truly
   applied and verified.
4. Enable Supabase Auth leaked-password protection in the project dashboard.
5. Provide final public-launch legal/support/data-vendor policy.
6. Keep Razorpay production checkout disabled until owner-approved production
   payment evidence exists.
7. Provide owner broker tokens only if real read-only Kite/Upstox smoke is
   desired; do not run live/sandbox order validation without explicit owner
   confirmation.
8. Run the exact activated `codex-security:security-scan` if it becomes
   available in the Codex environment.

## Exact Next Action

Resolve Supabase access: restore or provide valid `STAGING_SUPABASE_DB_URL` and
`PROD_SUPABASE_DB_URL`, or apply the prepared migration through an approved
Supabase dashboard path. After application, verify with advisors, update PR #74
with real production evidence, and rerun the Migration Drift Check.
