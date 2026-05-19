# Agent Identity Current Task Refresh

## Goal

Remove stale active-agent task instructions so future agents keep working toward
Professional Access polish and production data recovery instead of old completed
sprints.

## Agent Report

| Agent | Changed | Why it improves the product | Learned | Remaining risk |
| --- | --- | --- | --- | --- |
| Manager Agent | Refreshed active agent identity files after the operating-source update. | Agents now start from current recovery status and product constraints, which reduces duplicated or misdirected work. | Mission Control can be current while lower-level identity files still drift. | Static agent docs still need periodic refresh until they are generated from live issue/PR state. |
| Data Agent | Replaced the old breadth-endpoint sprint with production EOD recovery evidence responsibilities. | Data work now focuses on proving real EOD availability and post-Railway browser data recovery. | The no-data symptom is API hosting, not missing Supabase rows or a missing breadth endpoint. | Raw EOD freshness still depends on daily ingest staying healthy. |
| Deploy Agent | Updated secrets and current task around Railway backend recovery. | The deploy lane now points at the actual missing Railway values and the exact recovery gate. | GitHub has Supabase/Vercel secrets, but not the Railway recovery secrets. | Recovery remains owner-gated until Railway auth/secrets are available. |
| Feature Agent | Replaced old auth/breadth implementation instructions with Professional Access workflow polish guardrails. | Frontend work stays focused on clarity, data outage copy, and core trader flow instead of redoing completed plumbing. | Feature docs referenced files and tasks that no longer matched the repo. | Real production workflow proof still waits on Railway. |

## Validation

- Active agent/source scan found no stale beta/tooling/current-task phrases from
  the old workflow.
- `npm run test:public-posture-check` passed.
- `PUBLIC_SITE_URL=https://www.alphavyuh.com npm run check:public-posture`
  passed.

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
