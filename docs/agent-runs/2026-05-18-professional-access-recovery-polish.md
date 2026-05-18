# Professional Access Recovery Polish Agent Run

Date: 2026-05-18
Branch: `codex/professional-access-recovery-polish`

## Manager Agent

Changed:
- Coordinated backend recovery, product copy, frontend polish, QA/security, and release evidence lanes.
- Kept Railway recovery separate from copy polish because production API recovery is still owner-gated.

Why it improves the product:
- The launch work now distinguishes real completed polish from the remaining infrastructure blocker.

Learned:
- Supabase EOD data is fresh, but production cannot show it while Railway returns its fallback 404.

Remaining risks:
- Production dashboard/scanner/watchlist/full chart data cannot be verified until Railway backend hosting is recovered.

## Backend Recovery Agent

Changed:
- Added `npm run check:production-api:railway` so the canonical Railway backend smoke cannot be accidentally skipped.

Why it improves the product:
- Operators get a single explicit command for the production backend recovery gate.

Learned:
- `daily_ohlcv` contains 2026-05-18 EOD data with 3,147/3,447 symbols, so the data store is not the failing layer.

Remaining risks:
- GitHub is missing `RAILWAY_TOKEN`, `RAILWAY_PROJECT_ID`, and `RAILWAY_SERVICE`.
- Local Railway OAuth is expired and needs `railway login`.

## Product Copy Agent

Changed:
- Replaced heavier posture language like “Trading OS,” “trading edge,” and launch-environment phrasing with professional account/workflow copy.
- Cleaned pricing, signup, access, settings billing, 404, community, and careers language.

Why it improves the product:
- The product now reads like a professional platform instead of a test launch.

Learned:
- Active customer UI no longer contains legacy beta positioning; remaining beta/founder references are guardrails, historical docs, migrations, or compatibility aliases.

Remaining risks:
- Historical pitch/docs still use old launch language, but they are not part of active product UI.

## QA/Security Agent

Changed:
- Updated tests for the new account-based billing posture.
- Verified payment and broker safety gates remain disabled by default.

Why it improves the product:
- Copy changes did not weaken the broker execution or payment kill switches.

Learned:
- The new Railway API check fails correctly on the current production backend outage.

Remaining risks:
- Live production backend flags cannot be verified until Railway serves the app again.

## Evidence

Passing:
- `npm run lint`
- `npm run typecheck`
- `npm --prefix frontend run test -- --run`
- `npm audit --audit-level=moderate`
- `backend/.venv/bin/python -m pytest backend/tests/test_broker_order_safety.py backend/tests/test_payments.py -q`
- `backend/.venv/bin/python -m pip_audit -r backend/requirements.txt`
- `npm run test:public-posture-check`
- `npm run test:production-api-check`
- `npm run test:data-recovery-check`
- `PUBLIC_SITE_URL=https://www.alphavyuh.com npm run check:public-posture`
- `npm run test:e2e:layout`
- Local Browser smoke for `/`, `/login`, and `/access`

Expected failing recovery gate:
- `npm run check:production-api:railway`
- `npm run check:data-recovery`

Current blocker:
- Railway backend URL returns `x-railway-fallback: true` and `404 Application not found`.
