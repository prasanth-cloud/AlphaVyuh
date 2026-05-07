# AlphaVyuh Codex Security Scan — 2026-05-07

## Scan Activation

`codex-security:security-scan` was not available in this Codex session, and tool discovery did not expose it. This report is therefore a **manual skill-guided fallback** using:

`/Users/PRASAANTH/.codex/plugins/cache/openai-curated/codex-security/f812c146/skills/security-scan/SKILL.md`

Do not treat this as an activated Codex Security plugin pass. The fallback followed the cached phase sequence: threat model, finding discovery, validation, attack-path analysis, and final markdown output.

## Scope

Repository-wide scan of the checked-out AlphaVyuh branch for launch-relevant security issues, with extra attention to:

- auth redirects and auth boundary behavior
- service-role and broker-token exposure
- broker read-only/import and live-order gates
- payment webhook and billing posture
- user-owned Supabase data access assumptions
- unsafe HTML/client rendering
- market-data trust labels and demo/EOD posture
- full-chart cleanup changes in this PR

## Threat Model

Primary assets:

- Supabase user sessions and user-owned workflow data: watchlists, scanner lifecycle state, chart drawings/layouts, orders, and journal entries.
- Supabase service-role key and migration/RLS posture.
- Broker API keys, API secrets, request tokens, access tokens, refresh tokens, and imported trade data.
- Payment order/webhook integrity, even while production checkout remains disabled/waitlist-gated.
- EOD market-data provenance, freshness labels, and beta/trust copy.

Trust boundaries:

- Browser to Next.js authenticated app routes.
- Browser to FastAPI backend with Supabase bearer-token validation.
- Backend service-role access to Supabase tables/RPCs.
- Backend to Kite/Upstox provider APIs.
- Public beta/waitlist/feedback routes to backend storage.
- Razorpay webhook sender to backend webhook route.

Relevant attacker-controlled inputs:

- `next` redirect parameters, auth callback parameters, broker OAuth `request_token`/`code`/`state`, public waitlist/feedback form data, scanner filters, watchlist/chart/journal payloads, symbol route params, and payment/webhook bodies.

Severity calibration:

- Critical/high would require realistic account takeover, token/secret exposure, live order execution bypass, cross-user data access, payment activation forgery, RCE/injection, or significant sensitive-data exposure.
- Medium covers authenticated trust-boundary weaknesses, sensitive provider error leakage, beta-route auth posture mistakes, or broker/payment safety-gate erosion.
- Low/informational covers hardening and launch posture issues without a demonstrated attacker path.

## Runtime Inventory

Public/frontend surfaces reviewed:

- Auth: `frontend/proxy.ts`, `frontend/lib/safe-redirect.ts`, `frontend/app/auth/callback/route.ts`, `frontend/app/api/auth/login/route.ts`, `frontend/app/api/auth/signup/route.ts`, login/signup/reset pages.
- Authenticated app shell and local mock storage: `frontend/components/AppShell.tsx`, `frontend/lib/api.ts`, `frontend/lib/workflow.ts`.
- Trading screens: dashboard, scanner, watchlist, full chart, journal, settings/broker, data page.
- Public copy/routes: landing, beta, contact, policies, privacy, terms, pricing/settings billing posture.

Backend runtime surfaces reviewed:

- Auth middleware: `backend/app/middleware/auth.py`.
- Broker/order/import: `backend/app/routers/broker.py`, `backend/app/routers/brokers.py`, broker adapters/API wrappers, credential encryption.
- Payments: `backend/app/routers/payments.py`.
- User-owned data: watchlists, scanner, charts/drawings/workspace, journal, workflow, alerts/price alerts.
- Public/operator data: waitlist, feedback, data health, market/charts/stocks.
- Scheduled jobs and provider fetches: bhavcopy/EOD, yfinance fallback, market-data provider wrappers.

## Discovery Evidence

Representative commands and file review used:

```bash
rg -n "dangerouslySetInnerHTML|innerHTML|eval\\(|new Function|document\\.write|javascript:|window\\.location|localStorage\\.(setItem|getItem)|sessionStorage\\.(setItem|getItem)" frontend backend scripts --glob '!**/.venv/**' --glob '!**/node_modules/**' --glob '!**/__pycache__/**'
rg -n "NEXT_PUBLIC_.*(SERVICE|SECRET|TOKEN|KEY)|SUPABASE_SERVICE_ROLE|SERVICE_ROLE_KEY|service_role|BROKER_CREDS_KEY|KITE_ACCESS_TOKEN|UPSTOX_ACCESS_TOKEN|RAZORPAY_KEY_SECRET|WEBHOOK_SECRET" frontend backend scripts .github supabase docs --glob '!**/.venv/**' --glob '!**/node_modules/**' --glob '!**/__pycache__/**'
rg -n "redirect\\(|NextResponse\\.redirect|router\\.push|router\\.replace|next=|returnTo|callbackUrl|emailRedirectTo" frontend/app frontend/components frontend/lib frontend/proxy.ts --glob '!**/node_modules/**'
rg -n "subprocess|os\\.system|exec\\(|eval\\(|pickle|yaml\\.load|requests\\.|httpx\\.|open\\(|send_file|FileResponse|UploadFile|\\.rpc\\(|\\.select\\(|\\.insert\\(|\\.update\\(|\\.delete\\(" backend/app scripts --glob '!**/.venv/**' --glob '!**/__pycache__/**'
rg -n "session generation failed|code exchange failed|access_token|request_token|api_secret|logger\\.(error|warning|exception|info).*token|logger\\.(error|warning|exception|info).*secret|print\\(.*TOKEN|print-access-token" backend/app backend/scripts scripts --glob '!**/.venv/**'
```

Safe/suppressed rows:

| Row | Area | Disposition | Evidence |
| --- | --- | --- | --- |
| AUTH-redirect | Login/signup/callback redirects | Suppressed | `isSafeRedirect` rejects external, protocol-relative, backslash, control-char, and decoded unsafe values; auth callback resolves safe paths against same origin. |
| AUTH-boundary | Authenticated app routes | Suppressed | `frontend/proxy.ts` excludes `/dev-login` from public prefixes and only allows it when mock auth is enabled; app layout also requires a Supabase user. |
| HTML-client | `innerHTML`/`dangerouslySetInnerHTML` | Suppressed | Hits are static landing-page demo markup and a static initial theme script; no reviewed user-controlled value reaches an HTML sink. React rendering is used for feedback/journal/watchlist text. |
| SERVICE-role | Frontend service-role exposure | Suppressed | Service-role env hits are backend/scripts/docs/tests only. Frontend uses `NEXT_PUBLIC_SUPABASE_ANON_KEY`; no `NEXT_PUBLIC_*SERVICE*`/service-role key exposure found. |
| PAYMENT-webhook | Payment activation | Suppressed | Razorpay verify and webhook use HMAC with `compare_digest`; checkout remains disabled/waitlist-gated in UI posture. |
| BROKER-order | Live/sandbox order execution | Suppressed | Private beta default keeps `broker_live_orders_enabled = False`; order route requires feature flag and explicit `live_confirmed` before any live broker call. |
| DATA-ownership | Watchlist/scanner/chart/journal object access | Suppressed | Mutating user-owned routes filter by `user_id` or verify ownership before updates/deletes; service-role usage is backend-side only. |
| MARKET-data | Demo/EOD trust posture | Suppressed | Market surfaces use EOD/demo/fallback provenance metadata; this PR does not change market-data provider trust semantics. |

## Finding: Broker provider error text could expose session material

- Priority: P2
- Severity: medium
- Confidence: medium-high
- CWE: CWE-532, Insertion of Sensitive Information into Log File
- Affected lines before fix:
  - `backend/app/routers/broker.py`: raw Kite provider `e.message` was logged on Zerodha session generation failure and returned on import failure.
  - `backend/app/routers/broker.py`: Upstox order failure logged provider response text.
  - `backend/app/routers/brokers.py`: adapter OAuth callback logged and returned raw `BrokerError` text.

### Validation

The broker API wrappers build provider errors from response body message text. In broker auth/import flows that message may contain request-token, access-token, or API-secret-adjacent context from provider failures. The route already acknowledged this risk in a comment for the Zerodha callback response, but still logged `e.message`.

Focused validation added tests that inject provider errors containing `request_token`, `api_secret`, and `access_token` strings and verify they are absent from logs and responses after the fix:

- `backend/tests/test_broker_encrypted_credentials.py::test_zerodha_callback_does_not_log_or_return_sensitive_provider_message`
- `backend/tests/test_brokers_router.py::test_broker_connect_callback_sanitizes_provider_error`

Focused command:

```bash
backend/.venv/bin/python -m pytest backend/tests/test_broker_encrypted_credentials.py backend/tests/test_brokers_router.py backend/tests/test_broker_order_safety.py
```

Result: `14 passed`.

### Fix

- `backend/app/routers/broker.py`
  - Upstox order failures now log only HTTP status.
  - Zerodha order failures now log only status and `error_type`.
  - Zerodha import API failures return only `error_type`.
  - Zerodha session exchange failures log only status and `error_type`.
- `backend/app/routers/brokers.py`
  - Added `_safe_broker_error_detail`.
  - Adapter callback logs only broker id, error kind, and broker code.
  - Broker read-only/profile/holdings routes return sanitized broker errors.

### Attack Path

1. A broker provider or network path returns an error body that echoes request/session material.
2. AlphaVyuh wraps that body as a provider exception message.
3. Prior code wrote that message to logs or frontend error details on broker connection/import paths.
4. Anyone with log access, support transcript access, or captured frontend error output could see sensitive broker session material.

The issue does not enable order placement or direct account takeover by itself, but broker session material should never be exposed outside encrypted credential storage or provider calls.

### Status

Fixed in this PR. No surviving reportable finding remains for this row after validation.

## Coverage Closure

| Row | Disposition | Notes |
| --- | --- | --- |
| Broker token logging | Fixed | Validated with targeted backend tests; no raw request/access token appears in tested logs/responses. |
| Broker live execution gate | Suppressed | Existing backend flag and `live_confirmed` gate remain in place; no live/sandbox order path was run. |
| Real broker read-only smoke | Deferred | Owner did not provide real Kite/Upstox tokens; no real provider smoke was run. |
| Production Supabase/RLS | Deferred | No production Supabase changes were approved or made in this pass. Migration/RLS posture remains migration-governed. |
| Full repository exhaustive file-by-file scan | Deferred | Exact Codex Security plugin was unavailable; this fallback used direct file/tool review and did not claim activated-plugin exhaustive coverage. |

## Final Result

One validated medium security issue was fixed: broker provider error messages are now sanitized before logs and responses. No high or critical findings survived this manual fallback scan.

No Codex app review directives are emitted because the surviving issue was fixed in the branch.
