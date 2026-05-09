# Codex Security Scan — 2026-05-09

Scope: repository-wide scan of AlphaVyuh using the active `security-scan` Codex Security skill.

Scan artifacts:
- `/tmp/codex-security-scans/AlphaVyuh/2fd4fac_20260509-102602/report.md`
- `/tmp/codex-security-scans/AlphaVyuh/2fd4fac_20260509-102602/artifacts/`

## Result

Three validated security issues were fixed in this pass.

## Fixed Findings

### 1. Telegram webhook accepted unauthenticated updates

Affected area: `backend/app/routers/alerts.py`

Before: when `TELEGRAM_BOT_TOKEN` was configured, `/api/v1/alerts/telegram/webhook` accepted any POST body without validating Telegram's webhook secret-token header.

Fix:
- Added `TELEGRAM_WEBHOOK_SECRET` setting.
- Require `X-Telegram-Bot-Api-Secret-Token` to match the configured secret.
- Fail closed with `503` if the bot token is enabled but webhook secret is missing.

User impact:
- Prevents random internet callers from spoofing bot updates, causing bot spam, database reads by chat id, or unnecessary backend load.

### 2. Refresh ingest endpoint could fail open

Affected area: `backend/app/routers/ingest.py`

Before: `/api/v1/ingest/refresh-today` only rejected invalid `X-Service-Key` when `INGEST_SERVICE_KEY` was configured. If production env missed the key, the endpoint became callable without authentication.

Fix:
- Match `/bhavcopy` behavior.
- Require a configured `INGEST_SERVICE_KEY` and matching request header.

User impact:
- Protects market data integrity and avoids anonymous trigger of external Yahoo refreshes/database upserts.

### 3. Broker API key still synced to deprecated plaintext column

Affected area: `backend/app/routers/users.py`

Before: profile/onboarding broker API-key updates encrypted the key in `broker_credentials`, but also copied the same key into deprecated `users.broker_api_key`.

Fix:
- Keep encrypted write.
- Clear deprecated plaintext `broker_api_key` on new writes.
- Existing legacy fallback reads remain for backward compatibility until a reviewed cleanup migration is applied.

User impact:
- Reduces broker credential exposure from future writes without breaking existing migrated users.

## Dependency / Secret Checks

- `npm audit --audit-level=moderate`: passed, 0 vulnerabilities.
- `backend/.venv/bin/python -m pip_audit -r backend/requirements.txt`: passed, no known vulnerabilities in declared backend requirements.
- Local venv audit found advisories in extra packages not declared in `backend/requirements.txt`: `autobahn`, `twisted`, and `pip`. These appear to be local environment packages, not production requirements. If Kite websocket support is promoted to production, pin and audit the required package set explicitly.
- Secret-pattern scan found ignored local env files containing real-looking values; `git ls-files` confirmed they are not tracked, and `git check-ignore` confirmed env/Vercel files are ignored. No tracked live secret values were found in this pass.

## Suppressed / Safe Findings

- Razorpay webhook uses HMAC SHA-256 and `hmac.compare_digest`.
- Auth callback/signup redirects use `isSafeRedirect`.
- Broker live/sandbox order placement remains disabled by default and requires explicit confirmation if ever enabled.
- Service-role usage was found in backend/server contexts, not tracked frontend runtime code.
- Landing-page `innerHTML` usage is fed by static in-file literals; no attacker-controlled source was found.

## Validation

Passed:
- `npm run lint`
- `npm run typecheck`
- `npm --prefix frontend run test -- --run`
- `npm audit --audit-level=moderate`
- `backend/.venv/bin/python -m pytest backend/tests`
- `backend/.venv/bin/python -m pip_audit -r backend/requirements.txt`
- `npm run test:e2e:mock`
- `npm run test:e2e:layout`
- `npm run test:e2e:perf`

Focused backend security coverage:
- `backend/tests/test_security_hardening.py`
- `backend/tests/test_broker_encrypted_credentials.py`

## Remaining Owner / Operator Tasks

- Set `TELEGRAM_WEBHOOK_SECRET` in backend hosting before enabling/promoting the Telegram bot webhook.
- Configure Telegram webhook with the same secret token using Telegram's `setWebhook` `secret_token` parameter.
- Keep `INGEST_SERVICE_KEY` configured anywhere ingest endpoints are deployed.
- Plan a reviewed migration/operator cleanup for old non-null `users.broker_api_key` legacy values after confirming encrypted credentials are present.
