# Security Scan — PR #81 Broker Integration

Generated: 2026-05-10 11:05 ET

Scope: PR #81 broker integration branch, with emphasis on broker OAuth, token handling, order safety, import/journal sync, and the changed broker settings/callback frontend flow.

Method: Codex `security-scan` skill workflow with separate threat-model, finding-discovery, validation, attack-path analysis, and final reporting phases.

## Threat Model Summary

- Sensitive assets: broker OAuth codes, encrypted broker tokens, user portfolio/order/trade data, journal entries, Supabase user-owned data, plan-gated broker controls.
- High-risk boundaries: browser to backend auth boundary, broker OAuth redirect boundary, backend broker adapters to external broker APIs, Supabase service-role backend access.
- Required product controls: broker secrets must never be exposed to the frontend, live/sandbox order paths must remain gated, callbacks must bind to the initiating user, and broker imports must dedupe journal entries.

## Finding Discovery

### Candidate C-001 — Broker OAuth callback state was not validated

Status: Validated and fixed in this PR.

Affected surfaces before fix:

- `backend/app/routers/brokers.py` adapter-backed callback accepted `state` but did not verify it before exchanging the broker code.
- `backend/app/routers/broker.py` legacy JSON callback accepted only `code_or_token`; the frontend passed no state.
- `backend/app/routers/broker.py` Zerodha callback exchanged `request_token` without checking that the callback matched a broker connect initiated by the same logged-in AlphaVyuh user.

Impact: account-linking CSRF / confused-deputy risk. A logged-in user could be tricked into completing a broker callback URL carrying an attacker-originated broker code, causing the victim AlphaVyuh account to connect to the wrong broker account.

## Validation

Validation rubric:

- [x] Attacker-controlled input reaches broker callback through `request_token` or `code`.
- [x] Callback is reachable by authenticated users.
- [x] Previous code path exchanged the code before validating an OAuth state binding.
- [x] Impact changes broker connection state and stores broker credentials.
- [x] Fix rejects missing/invalid/mismatched state before broker code exchange.

Evidence after fix:

- `backend/app/brokers/oauth_state.py` signs a short-lived broker state using HMAC and binds it to a broker plus a keyed hash of the user id.
- `backend/app/routers/brokers.py` creates signed state in connect start and verifies it before code exchange.
- `backend/app/routers/broker.py` creates signed Zerodha login state and verifies it in both Zerodha and generic broker callback handlers.
- `frontend/app/(app)/broker/callback/page.tsx` requires the broker `state` parameter before calling backend callback APIs.
- Focused tests pass: `backend/tests/test_brokers_router.py` and `backend/tests/test_broker_order_safety.py`.

## Attack Path Analysis

Before fix:

1. Attacker initiates OAuth with a broker account they control and obtains a callback code/request token.
2. Attacker sends a logged-in AlphaVyuh user a callback URL containing that code.
3. The victim browser submits the callback with the victim AlphaVyuh session.
4. Backend exchanges the attacker-controlled code and stores resulting broker credentials under the victim user.

Severity: medium-high before fix because it could corrupt the broker-account linkage and journal/import state, but it did not directly bypass live-order gates or expose broker tokens to the frontend.

After fix: suppressed/fixed. The callback must carry a valid signed, unexpired state generated for the same user and broker before code exchange occurs.

## Other Security Checks

- Broker token responses remain server-side. Callback responses do not return raw access tokens.
- Zerodha API errors continue to avoid echoing request tokens or API secrets to the user.
- Live broker order placement remains disabled by default through `broker_live_orders_enabled = False` and still requires explicit live confirmation when enabled.
- PR #81 no longer adds an unapplied Supabase production migration; optional database migration work is left as a reviewed owner-gated follow-up.

## Result

No unresolved reportable security findings remain in the PR #81 broker integration diff after the OAuth state fix.

Remaining owner-gated work:

- Apply any future broker metadata tables through reviewed Supabase migrations only when production/staging access is available and evidence can be recorded.
- Real broker read-only smoke requires owner-provided valid broker tokens.
- Live/sandbox order validation remains gated and was not run.
