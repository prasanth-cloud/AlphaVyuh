# Agent Operating Source Refresh

## Goal

Keep the active agent instructions aligned with the Professional Access cleanup
and production data recovery process now running through Codex, GitHub PRs, and
Mission Control.

## Agent Report

| Agent | Changed | Why it improves the product | Learned | Remaining risk |
| --- | --- | --- | --- | --- |
| Manager Agent | Rewrote `AGENTS/README.md` around the current issue -> branch -> PR -> checks -> Mission Control workflow. | Future agents start from the same operating model the founder expects instead of an older manual handoff flow. | The `/agents` UI was current, but the source instructions agents read were stale. | A future version should generate Mission Control state from GitHub instead of static data. |
| Deploy Agent | Moved Railway backend recovery into `AGENTS/REQUESTS.md` as the active cross-agent blocker. | The no-data issue now has one visible owner request with exact recovery and verification commands. | Supabase EOD and Vercel env are healthy; Railway hosting and recovery credentials are still the blocker. | Recovery remains blocked until local Railway auth is refreshed or Railway GitHub secrets are added. |
| QA Agent | Expanded `check-public-posture` to scan active agent workflow docs and request files. | Agents cannot quietly reintroduce old beta posture into the instructions that drive new work. | Product posture checks should cover the sources agents reuse, not only visible pages. | Historical docs still preserve old launch wording intentionally and remain outside this guard. |

## Validation

- `npm run test:public-posture-check` passed.
- `PUBLIC_SITE_URL=https://www.alphavyuh.com npm run check:public-posture`
  passed.
- Active agent/runbook source scan found no forbidden legacy beta posture.
- `npm run check:data-recovery` still fails because Railway returns fallback
  `404 Application not found`; Vercel production env and Supabase EOD data pass.

## Current Blocker

Run:

```bash
npm run recover:railway-backend:login
```

Then complete Railway activation and rerun:

```bash
npm run check:data-recovery
RUN_PRODUCTION_RECOVERY_SMOKE=1 LIVE_URL=https://www.alphavyuh.com npm run launch:check
```
