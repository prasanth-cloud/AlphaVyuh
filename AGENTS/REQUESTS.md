# Cross-agent requests

When an agent needs something outside its ownership, it writes a request here.
The owning agent picks it up next session or the Manager Agent converts it into
a GitHub issue/PR slice.

Format:
```
### REQ-NNN: Short title
**From:** requesting-agent
**To:** target-agent
**Created:** YYYY-MM-DD
**Status:** open | in-progress | done

Description of what's needed and why.
```

## Open

### REQ-002: Production Supabase quota recovery
**From:** backend-data / QA
**To:** deploy
**Created:** 2026-05-19
**Status:** recovery observed; blocked on authenticated verification

`npm run check:data-recovery` now proves Railway hosting, Vercel production env,
GitHub recovery secrets, Railway recovery workflow, and local Railway CLI are
available. The remaining production blocker is Supabase project restriction:
`exceed_db_size_quota`.

Fresh evidence from 2026-06-16:

- `https://www.alphavyuh.com/api/auth/login` returns the Supabase Auth error
  `Service for this project is restricted due to the following violations:
  exceed_db_size_quota`.
- Railway `/health` returns 200, but
  `https://alphavyuh-production.up.railway.app/api/v1/market/summary` returns
  503 because backend PostgREST calls receive the same Supabase quota error.
- Supabase connector stats show the organization is on plan `free`, production
  database size is `1181 MB`, and the `daily_ohlcv` relation is `1132 MB`; Free
  plan read-only restriction starts at 500 MB.
- Vercel production env check passes after linking the checkout to the existing
  `frontend` Vercel project.

Fresh evidence from 2026-06-18 indicates the quota restriction is no longer
blocking public auth or the production data API:

- Invalid credentials now receive the expected HTTP 401 `Invalid login
  credentials`, not `exceed_db_size_quota`.
- `npm run check:data-recovery` passes the Railway market summary, breadth, and
  five-year chart smoke through the 2026-06-17 session.
- Vercel production configuration and the Railway recovery workflow still pass.

After recovery:

```bash
# Required for full app recovery evidence:
# export PRODUCTION_API_BEARER_TOKEN=<short-lived production smoke token>
# export PLAYWRIGHT_QA_EMAIL=<production QA login>
# export PLAYWRIGHT_QA_PASSWORD=<production QA password>
npm run check:data-recovery
RUN_PRODUCTION_RECOVERY_SMOKE=1 LIVE_URL=https://www.alphavyuh.com npm run launch:check
```

Completion evidence must include authenticated scanner/watchlist API smoke and
signed-in production browser smoke. A passing public `/health` or chart smoke is
not enough to close this request.

## Done

### REQ-001: Breadth sector endpoint
**From:** feature
**To:** data
**Created:** 2026-04-19
**Status:** done

Dashboard sector breadth is now served through the market overview/snapshot
path and consumed by `frontend/lib/api.ts` and the dashboard. Current production
visibility for this data is blocked by REQ-002, not by missing raw EOD rows.
