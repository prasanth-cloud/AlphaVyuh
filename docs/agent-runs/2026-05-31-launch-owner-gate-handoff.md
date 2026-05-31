# Launch Owner-Gate Handoff - 2026-05-31

## Scope

This handoff records the current AlphaVyuh launch-readiness queue after the
public-repo GitHub Actions recovery. It is intentionally evidence-only: no
production deploy, Supabase mutation, broker action, credential use, or direct
`main` merge was performed for this note.

## Current PR Queue

All open PRs below are draft, mergeable, Agent PR Gate green, and Vercel green
as of 2026-05-31.

| PR | Scope | Remaining gate |
| --- | --- | --- |
| #280 | Non-deploy signed-in production smoke workflow and QA assets | Owner decides overlap with #281 and provides signed-in smoke credentials |
| #281 | Data-trust recovery hardening and supplemental refresh metadata | Owner provides signed-in production smoke credentials |
| #288 | Broker read-only smoke gate before execution | Owner approves broker execution boundary and any real broker smoke credentials |
| #289 | 5Y daily chart coverage contract | Owner approves production/Supabase coverage path and post-deploy Railway smoke |
| #290 | Sector taxonomy metadata and drift checker | Owner/data approval for taxonomy direction and NSE industry parity posture |
| #299 | Scanner sector-strength ranking | Dependent on #285/#290 taxonomy direction approval |

## Merged In This Recovery Pass

- #308 was merged first as requested: `a40d0584a22d6209e80d8264bec0ef33ca4d354d`.
- #307 was refreshed on top of #308/current `main` and merged second:
  `6970a1793a21e131551cb8102321417ea8adb5f5`.
- #309 was closed as superseded because the repository-public change cleared the
  Actions billing/startup blocker it documented.

## Current Production Evidence

- Public Railway API is serving FastAPI data instead of Railway fallback 404.
- Current-main public production API smoke passes for market summary and core
  chart symbols under the deployed contract.
- Fresh read-only check from this PR worktree:
  `npm run check:production-api:railway` passed with summary `2026-05-29`,
  breadth `652/1745`, and RELIANCE/ITC/AUBANK each returning 500 daily candles
  through `2026-05-29`. Authenticated scanner data was skipped because
  `PRODUCTION_API_BEARER_TOKEN` is not available.
- Fresh public posture check from this PR worktree:
  `PUBLIC_SITE_URL=https://www.alphavyuh.com npm run check:public-posture`
  passed. Account-access copy is present and legacy beta/professional-brand
  posture is absent.
- Full app recovery is still not proven because authenticated scanner/watchlist
  API smoke and signed-in browser smoke need owner-approved runtime secrets.

Required runtime evidence before declaring full production recovery:

- `PRODUCTION_API_BEARER_TOKEN`
- `PLAYWRIGHT_QA_EMAIL`
- `PLAYWRIGHT_QA_PASSWORD`
- or approved `PLAYWRIGHT_SUPABASE_AUTH_COOKIES`

## Tracker Updates

The following GitHub trackers were refreshed so the issue board points at the
current gates instead of stale billing/build-rate-limit blockers:

- #63: top-level owner decision matrix.
- #137: full production recovery evidence tracker.
- #282: setup-review reconciliation with only #299 left open.
- #283: non-deploy signed-in production smoke path.
- #284: RS/yfinance supplemental refresh metadata gate.
- #285: sector taxonomy metadata and owner/data approval gate.
- #286: 5Y chart coverage contract gate.
- #287: broker read-only smoke and execution boundary gate.
- #103: Mission Control summary comments.

## Safety Notes

- Do not claim full production recovery from public API evidence alone.
- Do not run signed-in production smoke without owner-approved credentials or
  cookies.
- Do not run production Supabase repair/backfill/migration without explicit
  owner approval.
- Do not run real broker read-only smoke without owner-approved credentials.
- Do not run sandbox or live broker orders without exact written approval for
  broker, account, mode, symbol, side, quantity, order type, and risk plan.
- Do not implement TradingView Advanced Charts until #42 licensing is resolved.

## Next Smallest Safe Steps

1. Owner decides whether #281 alone should carry signed-in smoke/data-trust, or
   whether #280's unique QA/docs/onboarding/community assets should be split or
   merged separately.
2. Owner provides signed-in smoke credentials/cookies so the non-deploy workflow
   can produce authenticated scanner/watchlist/browser evidence.
3. Owner/data decision on #290 determines whether #299 can move out of draft.
4. Owner approves the #289 coverage path, then post-merge Railway 5Y chart smoke
   proves the deployed contract.
5. Broker execution remains read-only/order-intent until #288 is approved and a
   separate execution approval record exists.
