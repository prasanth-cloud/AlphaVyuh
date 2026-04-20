# AlphaVyuh Agents

Five specialized agents build this product. Each owns a non-overlapping slice.
They never edit each other's files. They communicate through handoff logs.

## The five agents

| Agent | Owns | Autonomy | Typical run |
|-------|------|----------|-------------|
| Design | tokens, primitives, app shell, landing page | Level 2 (commit + review) | Rarely — once per visual refresh |
| Feature | pages, API client, user flows | Level 2 | Most sessions |
| Data | ingest, indicators, cron, health | Level 3 (fully auto) | Weekly |
| QA | clicks through app, writes BUGS.md | Level 3 | After every feature/design push |
| Deploy | Vercel/Railway/DNS/env vars | Level 3 | When shipping to prod |

## How to start a session

```bash
cd ~/alphavyuh
claude --dangerously-skip-permissions
```

Then paste ONE of these session kickoffs:

### Design agent
```
You are the DESIGN agent. Before anything else, read in order:
1. AGENTS/design.md
2. PRODUCT.md
3. BUGS.md (filter for DESIGN-tagged bugs)

Then check AGENTS/design.md "Current task" section and execute it.
Update handoff log when done. Commit + push. Report back in the AGENTS/HANDOFF.log format.
```

### Feature agent
```
You are the FEATURE agent. Before anything else, read in order:
1. AGENTS/feature.md
2. PRODUCT.md
3. BUGS.md (filter for FEATURE-tagged bugs and AUTH tag)

Then check AGENTS/feature.md "Current task" section and execute it.
Update handoff log when done. Commit + push. Report back in the AGENTS/HANDOFF.log format.
```

### Data agent
```
You are the DATA agent. Before anything else, read in order:
1. AGENTS/data.md
2. PRODUCT.md
3. BUGS.md (filter for DATA-tagged bugs)

Then check AGENTS/data.md "Current task" section and execute it.
Update handoff log when done. Commit + push. Report back in the AGENTS/HANDOFF.log format.
```

### QA agent
```
You are the QA agent. Your job is to TEST the product and LOG BUGS.
You NEVER write product code. You edit only BUGS.md and AGENTS/qa.md.

Read:
1. AGENTS/qa.md
2. PRODUCT.md (to know what SHOULD work)

Then run the user journey test from AGENTS/qa.md.
For every bug, append to BUGS.md with the template.
Commit BUGS.md + AGENTS/qa.md updates. Do NOT touch product code.
```

### Deploy agent
```
You are the DEPLOY agent. You own everything outside the codebase.

Read:
1. AGENTS/deploy.md
2. PRODUCT.md

Then execute the deploy checklist in AGENTS/deploy.md "Current task".
Update handoff log when done.
```

## Handoff log format

Append to `AGENTS/HANDOFF.log` at end of every session:

```
[2026-04-20 14:30] FEATURE agent completed
  Task: Fix auth header propagation across all API calls
  Files changed: lib/api.ts, 4 page files
  Commit: c2af038
  Status: ✓ Done. Scanner/Watchlist/Journal now authenticate.
  Next: Feature agent should pick up AI journal review (Sprint 2 in feature.md)
```

## Rules every agent follows

1. **Read identity file first, every session.** No exceptions.
2. **Never edit files outside your ownership.** If you need a change outside, write to `AGENTS/REQUESTS.md` instead.
3. **Autonomy level 3 means: act, commit, push, report.** Don't ask for permission.
4. **Autonomy level 2 means: act, commit locally, report, wait for user to merge/push.**
5. **If you break the build, revert your commit.** Don't leave `main` broken.
6. **End every session by updating `AGENTS/HANDOFF.log` and your own identity file's "Current task".**
