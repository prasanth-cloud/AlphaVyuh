# AlphaVyuh Launch Security Scan — 2026-05-07

## Scope

Repository-wide launch security review for `prasanth-cloud/AlphaVyuh` on branch `launch/public-release-readiness-2026-05-07`.

The requested `codex-security:security-scan` skill is not installed in this Codex session, so this report records a manual fallback scan covering the same release concerns:

- threat model
- finding discovery
- validation
- attack-path review
- remediation evidence

## Threat Model

Primary assets:

- Supabase user sessions and user-owned trading workflow data.
- Supabase service-role key and migration/RLS posture.
- Broker OAuth tokens and credentials.
- Razorpay payment order/webhook integrity.
- Market-data provenance and trust labels.
- Journal, upload/import, AI/coaching, and feedback routes.

Primary abuse cases:

- Public route exposes dev-only auth behavior.
- Redirect abuse after login/signup/auth callback.
- Backend auth failures leak provider/internal details.
- Service-role key or broker token reaches browser logs/UI/test output.
- Payment verification or webhook accepts unsigned data.
- Broker order path places live/sandbox orders without explicit gate.
- Demo/fallback data is presented as live or official data.

## Discovery Commands

Manual scan patterns used:

```bash
rg -n "dangerouslySetInnerHTML|innerHTML|eval\\(|new Function|document\\.write|NEXT_PUBLIC_.*SERVICE|SERVICE_ROLE|service_role|access_token|refresh_token|broker.*token|print-access-token|redirect\\(|NextResponse\\.redirect|window\\.location|localStorage\\.(setItem|getItem)|console\\.(log|warn|error)" frontend backend scripts docs --glob '!**/.venv/**' --glob '!**/node_modules/**' --glob '!**/__pycache__/**'
rg -n "guarantee|guaranteed|returns|buy now|sell now|investment advice|not investment advice|signal service|signals|live data|real[- ]?time|Razorpay|checkout|billing|private beta|founder beta|EOD|broker import|execution disabled|live order" frontend/app frontend/components docs PRODUCT.md BETA_LAUNCH_CHECKLIST.md --glob '!**/node_modules/**'
```

Dependency checks are recorded in `docs/public-launch-readiness-2026-05-07.md` after validation.

## Findings And Fixes

### SEC-2026-05-07-01 — Dev Login Public Route

Severity: Medium  
Status: Fixed

`/dev-login` was included in `PUBLIC_PREFIXES`. The page still required a real Supabase OTP token and did not bypass auth by itself, but public production-like exposure of a development-named auth route is a trust and attack-surface issue.

Fix:

- Removed `/dev-login` from public prefixes.
- Added an explicit proxy gate: only mock app auth can access it; otherwise it redirects to `/login`.
- Added release-readiness browser coverage for production-like `/dev-login` redirects.

### SEC-2026-05-07-02 — Auth Provider Error Detail Leakage

Severity: Medium  
Status: Fixed

Backend auth middleware returned `Authentication failed: {provider_exception}` on unexpected Supabase Auth fallback errors. This could expose internal provider or network details.

Fix:

- Changed the response detail to the generic `Authentication failed`.
- Added a backend unit test proving provider exception text is not reflected.

### SEC-2026-05-07-03 — Broker Smoke Full Token Print Switch

Severity: Medium  
Status: Fixed

Read-only Kite and Upstox smoke scripts masked tokens by default, but `--print-access-token` could print a full session token during local validation.

Fix:

- Full token printing now also requires `ALLOW_PRINT_ACCESS_TOKEN=true`.
- Help text marks the option unsafe debug only.
- Default smoke output remains masked and does not place, modify, or cancel orders.

## Validated Safe Posture

- Broker order placement remains gated; live/sandbox submission is disabled unless the backend feature flag and explicit user confirmation are both present.
- Billing remains disabled in the UI (`checkoutEnabled = false`) even if Razorpay code is present.
- Public copy continues to avoid guaranteed-return and trade-call claims.
- Landing, onboarding, data, settings/broker, order modal, terms, privacy, and policy copy visibly state EOD/private beta/import-only/not-advice posture.
- Service-role keys appear only in backend env examples, docs, tests, and server-side scripts, not as `NEXT_PUBLIC_` frontend variables.
- Frontend `npm audit --audit-level=moderate` reported 0 vulnerabilities.
- Backend `pip-audit` reported no known vulnerabilities for `backend/requirements.txt`.
- Full backend tests passed, including broker order safety, encrypted credential, payment signature, rate-limit, and auth middleware coverage.

## Residual Owner-Gated Risks

- Production Supabase RLS/advisor evidence was not generated because production Supabase mutation/inspection was not approved.
- Real Kite/Upstox read-only smoke was not run because owner-provided tokens were not supplied.
- Razorpay production checkout is not enabled; payment launch needs owner approval and end-to-end test/live-mode evidence.
- Paid/live market-data redistribution requires vendor terms and launch-owner approval.
