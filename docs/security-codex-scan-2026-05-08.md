# Codex Security Scan Report — AlphaVyuh — 2026-05-08

Repository: `prasanth-cloud/AlphaVyuh`
Branch: `launch/public-release-readiness-2026-05-07`
Commit: `5a013a85b444c0a78c771065563ed6f48f63e24d`
Scope: repository-wide public-launch security scan
Scan artifact directory: `/tmp/codex-security-scans/alphavyuh/5a013a85b444_20260508-084003`

## Execution Mode

The installed Codex Security `security-scan` skill was active in this session and was used for this repository-wide scan. The workflow phases were kept separate:

1. Threat model
2. Finding discovery
3. Validation
4. Attack-path analysis
5. Final report

The plugin-specific MCP tool name `codex-security:security-scan` was not exposed as a separate callable tool; this report is based on the activated installed skill workflow available in the session.

## Finding Fixed

### Ingest refresh endpoint failed open when service key was unset

- Priority: P2
- Severity: medium
- Confidence: high
- CWE: CWE-306 Missing Authentication for Critical Function
- Affected lines: `backend/app/routers/ingest.py:20-52`

The market-data refresh endpoint is a privileged operator action because it can fetch external data and write market-data tables through backend service-role paths. Before this pass, `/api/v1/ingest/refresh-today` only rejected requests when `INGEST_SERVICE_KEY` was configured and mismatched. If the environment variable was accidentally absent in production, the route was open to unauthenticated callers.

Fix: added `_require_ingest_service_key()` so both ingest endpoints fail closed when the key is missing and reject missing/wrong headers. Added `backend/tests/test_ingest_security.py`.

Validation:

- `backend/.venv/bin/python -m pytest backend/tests/test_ingest_security.py backend/tests/test_broker_order_safety.py backend/tests/test_payments.py -q` — passed, 19 tests.
- `backend/.venv/bin/python -m pytest backend/tests -q` — passed, 175 tests.
- `npm run launch:check` — passed after the fix, including frontend lint/typecheck/unit/build/audit, mock workflow E2E, perf/layout E2E, backend HTTP smoke, backend focused tests, and backend dependency audit.

## No High/Critical Findings

No high or critical finding survived validation in this repository-wide scan.

## Coverage Closure

- Auth redirects: suppressed; `isSafeRedirect` rejects hostile values and auth routes use it.
- Backend auth: suppressed; Supabase JWT validation and Supabase Auth fallback are present.
- Broker order execution: suppressed; live orders require server flag plus explicit user confirmation. Existing broker safety tests pass.
- Broker secrets: suppressed; encrypted credential store uses AES-GCM with AAD and secrets are not returned to frontend.
- Payment/Razorpay: suppressed for current launch posture; checkout remains disabled/waitlist-gated, verify/webhook use HMAC checks.
- Frontend HTML sinks: suppressed; reviewed sinks use static local arrays or static script/CSS.
- Supabase advisors: production function search-path/direct execute warnings were previously resolved. Current remaining security advisors are no-policy INFO tables, intentional waitlist public insert, and leaked-password protection disabled.
- Telegram webhook: deferred P2 hardening; add Telegram secret-header validation before broadly promoting Telegram bot usage.
- Supabase migration history: deferred owner/DB-url reconciliation. Production hardening SQL was applied and verified, but migration history does not yet list `20260508001000_public_launch_security_hardening`.

## Supabase Advisor Refresh

Production project: `fyxltykqdvacbdgmeucf`

Security advisors after the production hardening SQL:

- No mutable function search-path warning remained for the targeted functions.
- No direct anon/authenticated execute warning remained for the targeted security-definer/helper functions.
- Remaining security advisors:
  - INFO: RLS enabled with no policies for deny-by-default/internal tables.
  - WARN: public waitlist insert policy is always true; this is intentional for public beta signup.
  - WARN: Supabase Auth leaked-password protection disabled; owner must enable this in the Supabase dashboard.

Performance advisors were also rerun. Remaining warnings are performance/index/RLS-efficiency items, not direct security blockers.

Migration history still does not list `20260508001000_public_launch_security_hardening` because the migration API refused the apply and the production DB URL path failed auth. The SQL was applied by direct Supabase SQL execution after owner authorization and verified by SQL/advisors; migration-history reconciliation remains owner/DB-access work.

## Remaining Owner-Controlled Gates

1. Enable Supabase Auth leaked-password protection in the Supabase dashboard.
2. Reconcile migration history for `20260508001000_public_launch_security_hardening` when a valid DB URL/dashboard migration path is available.
3. Keep Razorpay production checkout disabled until payment flow, webhook, refund/cancel, and owner approval evidence exists.
4. Do not run live/sandbox broker order validation without explicit account-owner confirmation.
5. Add Telegram webhook secret validation before public bot promotion.
