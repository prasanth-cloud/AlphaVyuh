# Recovery Preflight Next-Step Copy

## Goal

Make the production data recovery preflight point operators to the single
Railway recovery command instead of splitting guidance across raw `railway
login` and deploy commands.

## Agent Report

| Agent | Changed | Why it improves the product | Learned | Remaining risk |
| --- | --- | --- | --- | --- |
| Backend Recovery Agent | Updated `npm run check:data-recovery` next-step copy to recommend `npm run recover:railway-backend:login` for local recovery. | The owner sees one command that handles login, backend recovery, and verification instead of piecing together multiple steps. | Even small wording drift in recovery tools slows down owner-gated operations. | Railway activation is still owner-controlled and cannot be completed by code changes. |
| QA Agent | Updated data-recovery checker tests to assert the single-command helper appears in blocked recovery output. | Prevents future edits from regressing to less useful Railway login guidance. | Recovery UX is testable, not just documentation. | The live production API still cannot pass until Railway serves the backend. |

## Validation

- `npm run test:data-recovery-check` passed.
- `npm run check:data-recovery` remains expected to fail on Railway recovery
  while Vercel env and Supabase EOD data pass.

## Current Blocker

Run:

```bash
npm run recover:railway-backend:login
```

Then complete Railway activation and rerun:

```bash
npm run check:data-recovery
npm run test:e2e:prod:smoke
```
