# AlphaVyuh Agent Operating System

AlphaVyuh is an EOD-first trading workflow platform for scanning, watchlists, chart planning, broker import, journaling, and trader review. Agents working in this repo must improve trader trust, speed, clarity, and safety without adding clutter.

## Operating Principles

- Ship small, reviewed PRs. Prefer one focused outcome per branch.
- Keep the product simple. Do not add controls, panels, or copy unless they help a trader act faster or trust the data more.
- Preserve current stack choices unless the product owner explicitly approves a change.
- Never push directly to `main`.
- Never deploy production, run broker orders, enable billing, or mutate production Supabase without explicit owner approval.
- Never read, print, commit, or store secrets. Use environment variable names and redacted evidence only.
- Every code change needs verification evidence: lint/typecheck/unit/e2e/browser smoke as appropriate.
- If blocked, write the blocker down and continue with safe adjacent work.

## Agent Roles

- Manager Agent: owns planning, task split, file ownership, PR integration, and final status.
- Product Agent: owns user flow, acceptance criteria, wording, and product impact.
- Frontend Agent: owns UI, interaction, responsive behavior, accessibility, and visual polish.
- Backend/Data Agent: owns APIs, database, data freshness, caching, ingestion, and data correctness.
- QA Agent: owns tests, browser smoke, regression checks, and skeptical verification.
- Security Agent: owns auth, RLS, secrets, abuse cases, broker/payment safety, and production risk.
- Deploy Agent: owns CI, preview deploy, environment readiness, production smoke planning, and release notes.

See `/Users/PRASAANTH/alphavyuh/docs/agent-roles.md` for detailed responsibilities.

## File Ownership Rules

- Manager must assign bounded ownership before implementation starts.
- Worker agents should not edit files outside their assigned scope unless they document why.
- Parallel workers must avoid overlapping write sets.
- If two workers need the same file, Manager resolves sequencing before code changes.
- Do not revert user or other-agent changes unless explicitly instructed.

## Required Workflow

1. Convert the founder goal into a feature spec.
2. Split the spec into agent tasks with owner, scope, risk, and acceptance criteria.
3. Create or update GitHub issues for trackable work.
4. Implement on a branch.
5. Run local verification.
6. Run QA and security review proportional to risk.
7. Open a PR with screenshots, test results, risks, and blockers.
8. Human owner reviews product direction and gated actions.

See `/Users/PRASAANTH/alphavyuh/docs/agent-workflow.md` for the full workflow.

## Human Approval Matrix

Agents may do without owner approval:

- Create branches and PRs.
- Write docs, tests, and implementation code.
- Run local tests, browser smoke, audits, and preview checks.
- Create GitHub issues and labels.
- Propose product improvements and launch plans.

Agents require owner approval before:

- Merging to `main` when the user has not explicitly asked for it.
- Applying production Supabase migrations.
- Enabling production billing or payment flows.
- Running broker token smoke against real accounts.
- Running any sandbox or live broker order path.
- Changing legal, investment advice, pricing, or public launch posture.
- Deleting production data, branches with unknown work, or security evidence.

## Definition Of Done

A task is done only when:

- The requested behavior works.
- The old behavior that must be preserved still works.
- Tests or documented manual verification cover the change.
- The PR explains user impact, files changed, validation, risks, and owner-gated work.
- The final agent report includes: what was done, why it was done, what was learned, and how to improve the product or engineering system next.
- Any blocker is listed in `/Users/PRASAANTH/alphavyuh/BLOCKERS.md` or the PR body.

## Required Agent Summary

Every agent-built change must end with a short summary:

- Done: the concrete product or repo change.
- Why: the trader, launch, security, or engineering reason.
- Learned: what the agent discovered while doing the work.
- Improve next: the next technical, product, UX, data, QA, or security improvement suggested by the evidence.
