# Codex Security Scan Report — 2026-05-07

Repository: `prasanth-cloud/AlphaVyuh`
Branch: `launch/public-release-readiness-2026-05-07`
Scope: repository-wide public-launch security review

## Execution Mode

The requested `codex-security:security-scan` plugin/skill was not active in this
Codex session. The local cached skill instructions were available at:

`/Users/PRASAANTH/.codex/plugins/cache/openai-curated/codex-security/f812c146/skills/security-scan/SKILL.md`

This report is therefore a manual skill-guided fallback, not an activated
Codex Security plugin run. Do not treat it as proof that the exact
`codex-security:security-scan` plugin passed.

## Phase 1 — Threat Model

Primary assets:

- Supabase auth sessions and user-owned workflow, journal, watchlist, and broker
  import data.
- Supabase service-role key and migration/RLS posture.
- Broker OAuth/session credentials for Kite and Upstox.
- Razorpay payment orders, verification signatures, and webhook integrity.
- Market-data provenance, fallback/demo labeling, and EOD freshness signals.
- Public auth, redirect, feedback, AI/journal, broker, payment, and market-data
  API surfaces.

Primary abuse cases:

- Public visitors access dev/mock auth surfaces in production mode.
- Login/signup/auth callback redirects can be abused for external redirects.
- Backend auth or broker failures leak provider details, tokens, or account data.
- Service-role key or broker tokens are exposed in frontend bundles, UI, logs, or
  PR evidence.
- Broker live/sandbox order submission bypasses explicit release gates.
- Billing checkout starts before production Razorpay, webhook, refund/cancel,
  failed-payment, and owner approval evidence exists.
- Demo/fallback data is presented as official live market data.

## Phase 2 — Finding Discovery

Repository-wide discovery commands used:

```bash
git ls-files .env.local backend/.env frontend/.env frontend/.env.local .vercel .mcp.json
rg -n "dangerouslySetInnerHTML|innerHTML|eval\\(|new Function|document\\.write|NEXT_PUBLIC_.*SERVICE|SERVICE_ROLE|service_role|access_token|refresh_token|broker.*token|print-access-token|redirect\\(|NextResponse\\.redirect|window\\.location|localStorage\\.(setItem|getItem)|console\\.(log|warn|error)" frontend backend scripts docs --glob '!**/.venv/**' --glob '!**/node_modules/**' --glob '!**/__pycache__/**'
rg -n "guarantee|guaranteed|returns|buy now|sell now|investment advice|not investment advice|signal service|signals|live data|real[- ]?time|Razorpay|checkout|billing|private beta|founder beta|EOD|broker import|execution disabled|live order" frontend/app frontend/components docs PRODUCT.md BETA_LAUNCH_CHECKLIST.md --glob '!**/node_modules/**'
rg -n "BROKER_LIVE_ORDERS_ENABLED|live_confirm|place_order|sandbox|Razorpay|verify.*payment|webhook|safeRedirect|safe_redirect|SERVICE_ROLE|SUPABASE_SERVICE_ROLE|NEXT_PUBLIC_SUPABASE" backend frontend scripts
```

Reviewed surfaces:

- Public copy and legal posture on landing, beta, terms, privacy, policies, auth,
  onboarding, settings/billing, settings/broker, data, charts, journal, and order
  modal surfaces.
- Frontend redirect usages and Supabase auth callback code paths.
- Backend broker order router and Kite/Upstox adapter safety gates.
- Payment order, verification, and webhook signature handling.
- Token printing in broker smoke scripts.
- Service-role key usage and tracked secret candidates.

## Phase 3 — Validation

Validated safe or already-mitigated controls:

- `.env.local`, backend `.env`, frontend `.env`, and Vercel local state are not
  tracked. `.mcp.json` is tracked and references a GitHub token environment
  variable name, but no literal token value was printed or found by the redacted
  inspection.
- Service-role key references are server-side env examples, backend scripts, or
  tests; no `NEXT_PUBLIC_*SERVICE*` exposure was found.
- Broker smoke scripts mask tokens by default and require
  `ALLOW_PRINT_ACCESS_TOKEN=true` before full token printing.
- Broker order placement remains gated by backend release flag and request
  confirmation; UI copy continues to state execution is disabled for beta.
- Razorpay webhook code verifies `X-Razorpay-Signature` before accepting webhook
  events; checkout remains disabled in the UI via `checkoutEnabled = false`.
- Public copy continues to avoid guaranteed-return and trade-call claims and
  states educational/not-investment-advice posture.
- Market surfaces use EOD/demo/fallback/live-beta provenance components and copy.
- Landing-page `innerHTML` usages render static local arrays, not user input.
- Auth callback and auth forms use the existing safe redirect helpers/tests.

No new validated high or critical security finding was found in this refresh.

## Phase 4 — Attack-Path Analysis

### Broker order bypass

Attack path considered: user connects a broker, tampers with frontend payload, and
sets `live_confirmed=true`.

Disposition: mitigated for beta. Backend rejects live-confirmed orders unless
`BROKER_LIVE_ORDERS_ENABLED=true`, and release docs state this flag must not be
enabled without owner approval. Backend safety tests cover the gate.

### Payment bypass or premature checkout

Attack path considered: user opens billing, invokes Razorpay checkout, or sends a
fake verification/webhook payload.

Disposition: mitigated for disabled beta posture. Checkout buttons are disabled
with `checkoutEnabled = false`. Server webhook verification uses HMAC signature
checking. Paid launch remains owner-gated.

### Secret exposure

Attack path considered: frontend bundle or tracked repository files expose
service-role keys or broker tokens.

Disposition: no literal secret found by this manual pass. `.mcp.json` is tracked
but only names the expected GitHub token environment variable; owners may still
prefer moving local MCP config out of the repo.

### Misleading data or advice

Attack path considered: public user treats demo/fallback/EOD scanner output as
live advice.

Disposition: current copy is beta-safe and provenance-labeled. Full public launch
still needs owner-approved legal/data policy before removing beta posture.

## Final Findings

No new high or critical repository security finding was validated in this
manual fallback scan.

Residual owner-gated items remain:

1. Run the exact activated `codex-security:security-scan` plugin if/when it is
   available in the Codex environment.
2. Apply and verify the prepared production Supabase hardening migration:
   `supabase/migrations/20260508001000_public_launch_security_hardening.sql`.
3. Provide final public-launch legal, support, market-data, and billing policy.
4. Provide owner-approved Razorpay production checkout evidence before enabling
   paid checkout.
5. Provide owner broker tokens only for read-only Kite/Upstox smoke; do not run
   live/sandbox order placement without explicit account-owner confirmation.

## Validation Evidence

See `docs/public-launch-readiness-2026-05-07.md` and
`docs/public-launch-completion-audit-2026-05-07.md` for command evidence from
the release validation pass.
