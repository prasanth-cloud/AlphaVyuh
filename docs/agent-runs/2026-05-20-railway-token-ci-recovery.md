# Railway Token CI Recovery

## Summary

- GitHub repository secrets now include the Railway recovery token and project/service identifiers.
- The first `Railway Backend Recovery` workflow run reached the `Recover backend` step, then failed during `railway link` with an unauthorized Railway CLI response.
- Local Railway recovery and the production Railway API health/data smoke are already passing.
- Updated `scripts/recover-railway-backend.sh` so token-based CI deploys with explicit `railway up --project ... --service ... --environment ...` flags instead of requiring `railway link`.

## Verification

- `bash -n scripts/recover-railway-backend.sh`
- `RAILWAY_TOKEN=dummy RAILWAY_PROJECT_ID=411c9001-5e3c-47e4-8638-5224d6316b65 RAILWAY_SERVICE=AlphaVyuh SKIP_RAILWAY_DEPLOY=1 PRODUCTION_API_URL=https://alphavyuh-production.up.railway.app npm run recover:railway-backend`
  - Production health returned `{"status":"ok","version":"0.3.1"}`.
  - Production API smoke passed with summary date `2026-05-20`, breadth data, and chart candles for `RELIANCE`, `ITC`, and `AUBANK`.

## Next Step

Merge this script update to `main`, rerun the manual `Railway Backend Recovery` workflow, and verify the strict authenticated data preflight plus signed-in production browser smoke complete successfully.
