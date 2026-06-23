# AlphaVyuh Bugbot Review Focus

Prioritize findings that break **trader trust**, **auth safety**, or **core workflow** (scan → chart → watchlist → journal).

## High severity

- Mock/demo data leaking into production live mode
- HTTP 200 unavailable payloads treated as success or empty results
- Mutations marked successful without backend confirmation
- Supabase service-role key or secrets exposed to the browser bundle
- Auth bypass, open redirects on `next`, or missing JWT on user-data routes
- Live broker order placement without explicit safety gates
- RLS disabled or bypassed on user-owned tables

## Medium severity

- Empty states that hide outages (scanner, watchlist, chart, journal, alerts, dashboard)
- Stale EOD or unknown provenance shown as current without badge/warning
- Missing error handling on account-data hydration (watchlists, journal, broker)
- Chart drawing/layout persistence returning success when not saved

## Low severity / out of scope unless user-facing

- Pure styling nits without trust impact
- Internal docs-only changes
- Test-only refactors with no behavior change

## Review checklist

1. Trace API helper → client state → UI empty/error branch.
2. Confirm unavailable/degraded paths have tests or e2e coverage.
3. Confirm AGENTS.md approval matrix is respected (no prod migrations/deploys in PR).
4. Prefer smallest honest fix over broad refactors.

## Commands agents should run after fixes

```bash
npm run typecheck
npm run lint
npm test -- <targeted unit file>
npm run test:e2e:mock  # when user-facing flows change
```
