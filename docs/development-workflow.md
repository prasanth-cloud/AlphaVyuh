# AlphaVyuh development workflow

Adopted on 2026-10-14 from [pstack 0.15.24](https://github.com/cursor/plugins/tree/1e5c90a4b6f249917bd21fe361b3a2a7deb741b8/pstack), by Lauren Tan, MIT licensed.
This is an adaptation for this repository and Codex's available tools. It does
not install Cursor plugins, change models, or change the owner approval matrix.

## Working loop

1. Read the affected callers and name the observable behavior, authoritative data
   shape, and failure state. Distinguish recorded trade returns, cash P&L, planned
   risk, account equity, and hypothetical forecasts.
2. Reproduce a defect on its actual surface. Use a cheap failing regression when
   available. A provider outage must remain unavailable rather than become an
   empty successful response.
3. Choose the smallest useful change. Parse external data once at the boundary;
   keep domain calculations pure. Delete obsolete internal paths when callers
   migrate, without removing legitimate API-boundary defenses.
4. Delegate disjoint scopes with a named owner and acceptance criteria. Serialize
   changes to shared files and local Next build/dev artifacts. Root reviews each
   diff and owns the combined result.
5. Run focused checks, then the complete affected workflow. Review independently
   and fix verified findings. A compiled build does not establish hosted Auth,
   licensed market data, or production recovery.
6. Publish small intent-based commits with concrete evidence, observed failures,
   and unrun gates. Keep production merge/deploy and credential entry under the
   repository's existing owner controls.

## Repeatable verification

With Node22, installed root/frontend dependencies, Python3.12 with backend
requirements, Playwright Chromium, and PostgreSQL17 tools available:

```bash
PYTHON_BIN=backend/.venv/bin/python bash scripts/check-analytics-recovery.sh
```

Set `PYTHON_BIN` to the prepared runtime's actual executable. Set
`ALPHAVYUH_QA_DIR` to choose the report directory. The runner collects independent
checks after failures and records `PASS`, `FAIL`, or `NOT_RUN` in `gates.tsv`, with
separate logs. Exit1 means failures; exit2 means incomplete verification.
The report records each command and elapsed time. Source status, the tracked
patch, and the runner source identify local edits; browser suites retain
separate artifact folders so one suite cannot erase another suite's failure.
It uses fake provider settings for local tests and never deploys, applies hosted
migrations, submits broker orders, or sends an account-confirmation email.

Hosted signup, authenticated API access, and licensed market history always
remain `NOT_RUN` in this local runner. Verify them separately on the deployed
artifact and link their evidence. Review output must identify its commit and
scope. Do not reuse an older clean review for changed code.

The [current evidence](analytics-recovery-verification.md) includes known root
and frontend audit failures, inherited service-role architecture failures, and
an old-target migration-authentication failure. Keep them visible. Do not
introduce unused imports, broaden an allowlist, suppress an advisory, or relabel
a skip to obtain green.

## Applied pstack principles

- [Build the Lever](https://github.com/cursor/plugins/blob/1e5c90a4b6f249917bd21fe361b3a2a7deb741b8/pstack/skills/principle-build-the-lever/SKILL.md) led to the committed verification runner and replayable PostgreSQL harness.
- [Prove It Works](https://github.com/cursor/plugins/blob/1e5c90a4b6f249917bd21fe361b3a2a7deb741b8/pstack/skills/principle-prove-it-works/SKILL.md) requires actual browser/API/schema evidence for the claimed environment.
- [Boundary Discipline](https://github.com/cursor/plugins/blob/1e5c90a4b6f249917bd21fe361b3a2a7deb741b8/pstack/skills/principle-boundary-discipline/SKILL.md) keeps provider/JSON parsing outside pure forecast calculations.
- [Test Behavior, Not Implementation](https://github.com/cursor/plugins/blob/1e5c90a4b6f249917bd21fe361b3a2a7deb741b8/pstack/skills/principle-test-behavior-not-implementation/SKILL.md) requires literal trade outcomes and user-visible failures, rather than merely checking that a mock was called.
- [Explain the Number](https://github.com/cursor/plugins/blob/1e5c90a4b6f249917bd21fe361b3a2a7deb741b8/pstack/skills/principle-explain-the-number/SKILL.md) requires a measured baseline, repeated runs, environment, and limiting resource before any performance claim. No speedup is claimed from build or test duration alone.

Cursor-specific slash commands, agent types, model defaults, browser tooling,
chat automation, and auto-landing examples are not assumed available or
authorized here. Use the existing Codex tools and repository release rules.
