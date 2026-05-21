# Railway Backend Recovery

Date: 2026-05-20
Branch: `codex/railway-backend-recovery-script-fix`

## What Changed

- Completed Railway browserless login locally with owner activation.
- Recovered the Railway backend service for the `AlphaVyuh` project.
- Switched Vercel production `NEXT_PUBLIC_API_URL` from the temporary same-origin read-only recovery API back to the Railway backend:
  - `https://alphavyuh-production.up.railway.app`
- Fixed `scripts/recover-railway-backend.sh` so it works on macOS Bash when no explicit service is provided.
- Fixed the script deploy command to match the working Railway CLI invocation by removing the trailing `.` path argument.
- Added stable GitHub recovery secrets for the Railway project and service identifiers.

## Verification

- Railway `/health` returns `{"status":"ok","version":"0.3.1"}`.
- Railway public production API smoke passed:
  - summary date `2026-05-20`
  - breadth `1548/1486`
  - RELIANCE, ITC, and AUBANK charts with 500 candles through `2026-05-20`
- Vercel production env check passed:
  - frontend points at `https://alphavyuh-production.up.railway.app`
  - data mode is `live`
  - mock fallback is `false`
- Supabase EOD data check passed:
  - latest `daily_ohlcv` date `2026-05-20`
  - `3104/3449` active symbols
  - `90%` coverage
- Local Railway CLI check passed.

## Remaining Blockers

- GitHub recovery secret `RAILWAY_TOKEN` is still missing.
- Authenticated production smoke still needs a real `PRODUCTION_API_BEARER_TOKEN`.
- Signed-in browser smoke still needs `PLAYWRIGHT_QA_EMAIL` and `PLAYWRIGHT_QA_PASSWORD`, plus a seeded read-only QA watchlist.

The public production backend data path is recovered. Full recovery is not complete until authenticated scanner/watchlist verification and signed-in browser smoke pass.
