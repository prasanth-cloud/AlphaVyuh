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

### REQ-002: Railway backend recovery
**From:** backend-data / QA
**To:** deploy
**Created:** 2026-05-19
**Status:** blocked on owner-controlled Railway auth or GitHub recovery secrets

`npm run check:data-recovery` proves Supabase EOD rows and Vercel production
env are healthy, but `https://alphavyuh-production.up.railway.app/health`
returns Railway fallback `404 Application not found`.

Deploy owner must provide Railway recovery values or refresh local Railway auth:

```bash
npm run recover:railway-backend:login
```

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
