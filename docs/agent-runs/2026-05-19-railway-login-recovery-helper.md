# Railway Login Recovery Helper

## Goal

Reduce the remaining production data recovery friction after Professional Access
cleanup by turning the local Railway login + deploy + verification sequence into
one operator command.

## Agent Report

| Agent | Changed | Why it improves the product | Learned | Remaining risk |
| --- | --- | --- | --- | --- |
| Backend Recovery Agent | Added `npm run recover:railway-backend:login`, which starts Railway browserless login when needed, then runs the existing backend recovery and data preflight. | The repeated blocker is expired Railway auth. The owner now has one command that waits for activation and continues recovery immediately after auth succeeds. | Railway browserless auth can be initiated from the agent terminal, but the owner must complete activation. | Recovery still cannot finish until the owner completes Railway activation or provides Railway GitHub secrets. |
| Release Agent | Documented the single-command recovery path in the customer launch runbook. | Launch recovery no longer depends on remembering a multi-step sequence from chat history. | Operator runbooks should encode the exact command path for external-gated work. | The production API currently remains down until Railway deploy access is restored. |

## Validation

- `bash -n scripts/login-and-recover-railway-backend.sh`
- `npm run check:data-recovery` remains expected to fail while Railway returns
  fallback `404 Application not found`; Vercel env and Supabase EOD data pass.

## Current Blocker

Railway authentication remains owner-controlled. Run:

```bash
npm run recover:railway-backend:login
```

Then complete the Railway activation flow shown in the terminal.
