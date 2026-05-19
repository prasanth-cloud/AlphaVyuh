# AlphaVyuh Agent Operating System

AlphaVyuh is built by a manager-agent workflow: a Manager Agent breaks product
work into focused slices, specialist agents own implementation and verification,
and every meaningful change ships through a GitHub PR with evidence.

## Current Product Posture

- Positioning: Professional Access.
- Market data: latest available EOD data.
- Broker posture: broker import only; live broker order placement is not enabled.
- Billing posture: access is approval-managed until payment operations are ready.
- Production data state: Supabase EOD data is present, but the Railway backend
  must be recovered before alphavyuh.com can show real app data.

The current recovery command is:

```bash
npm run recover:railway-backend:login
```

After Railway recovery:

```bash
# Required for full app recovery evidence:
# export PRODUCTION_API_BEARER_TOKEN=<short-lived production smoke token>
# export PLAYWRIGHT_QA_EMAIL=<production QA login>
# export PLAYWRIGHT_QA_PASSWORD=<production QA password>
npm run check:data-recovery
RUN_PRODUCTION_RECOVERY_SMOKE=1 LIVE_URL=https://www.alphavyuh.com npm run launch:check
```

Do not treat public API recovery as launch recovery. Full recovery requires the
authenticated scanner/watchlist API smoke plus the signed-in production browser
smoke for dashboard, scanner, watchlist, full chart, and journal.

## Agent Lanes

| Agent | Owns | Current focus |
| --- | --- | --- |
| Manager | Task breakdown, branch scope, PR integration, issue updates, Mission Control | Keep work moving through small PRs with evidence and explicit blockers. |
| Product | Positioning, copy, user flow, trader workflow priorities | Keep AlphaVyuh minimal, professional, EOD-first, and non-advisory. |
| Frontend | App routes, UI behavior, dashboard/scanner/watchlist/chart/journal/settings | Keep the trader workflow fast, uncluttered, and honest about data state. |
| Backend/Data | EOD ingest, market APIs, indicators, data health, recovery checks | Keep raw EOD data fresh and make recovery evidence self-diagnosing. |
| QA | Unit, backend, browser, posture, layout, perf, release checks | Verify full workflows, not just changed files. |
| Security | Auth, RLS, secrets, broker/billing safety, public posture | Prevent secret leakage, unsafe execution, and misleading claims. |
| Deploy | Vercel, Railway, GitHub secrets, domains, release gates | Restore Railway backend hosting and keep deploy evidence current. |

Use `/agents` in the app for the current operator view of agent lanes, shipped
PRs, blockers, and next actions.

## Operating Loop

1. Start with the current blocker and the highest-impact unblocked product risk.
2. Create or reuse a focused `codex/<short-task>` branch.
3. Keep each slice small enough for one PR and one clear validation story.
4. Update tests, docs, and agent-run evidence alongside behavior changes.
5. Open a PR, wait for checks, merge only when green.
6. Pull latest `main`, rerun the relevant smoke or recovery check.
7. Update the tracking issue and Mission Control when the state changes.

## Required Evidence

Every agent-run report should answer:

- What changed.
- Why it improves the product.
- What was learned.
- Remaining risks.

Use `docs/templates/agent-run-report.md` for new reports.

For product or release changes, include the relevant commands from:

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e:mock
npm run test:e2e:layout
npm run test:e2e:perf
npm run check:data-recovery
PUBLIC_SITE_URL=https://www.alphavyuh.com npm run check:public-posture
```

Run the full production recovery gate only after Railway is recovered:

```bash
# Requires PRODUCTION_API_BEARER_TOKEN and a valid production QA login.
RUN_PRODUCTION_RECOVERY_SMOKE=1 LIVE_URL=https://www.alphavyuh.com npm run launch:check
```

## Rules Every Agent Follows

1. Preserve the Professional Access posture. Do not reintroduce tester-program
   language into active product or agent source.
2. Keep copy informational. AlphaVyuh does not give investment advice.
3. Do not enable live broker order placement.
4. Do not enable production checkout unless payment operations are explicitly
   approved and verified.
5. Do not print or commit secrets.
6. If blocked by owner-controlled credentials, record the exact command or value
   needed and keep working on unblocked verification or product polish.
7. Keep unrelated local files and user changes untouched.

## Active Files

- `docs/agent-workflow.md` — process details.
- `docs/agent-mission-control.md` — operator dashboard model.
- `frontend/lib/agentMissionControl.ts` — in-app `/agents` status data.
- `docs/agent-runs/` — per-slice agent reports.
- `AGENTS/REQUESTS.md` — cross-agent requests.
- `AGENTS/PRIORITY.md` — product priority guardrails.
