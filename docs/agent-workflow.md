# Agent Workflow

This workflow keeps AlphaVyuh agent work fast without turning the codebase into chaos.

## 1. Goal Intake

The Manager Agent starts by rewriting the request into:

- Business goal.
- User flow.
- Acceptance criteria.
- Constraints.
- Verification plan.
- Owner-gated decisions.

Use `/Users/PRASAANTH/alphavyuh/docs/templates/feature-spec.md`.

## 2. Task Breakdown

Manager creates task slices that can run independently:

- Product slice: flow, copy, UX rules, metrics.
- Frontend slice: components, pages, browser behavior.
- Backend/Data slice: API, data, cache, migrations.
- QA slice: unit/e2e/manual smoke.
- Security slice: auth, RLS, secrets, abuse cases.
- Deploy slice: CI, preview, env, release posture.

Each task must include file ownership and expected output.

## 3. Issue Creation

Create GitHub issues for trackable work using:

- Feature request.
- General bug report.
- Agent task.
- Launch blocker.

Labels should describe role, status, impact, and risk. Recommended labels live in `/Users/PRASAANTH/alphavyuh/.github/labels.yml`.

## 4. Branch And Ownership

Use a focused branch name:

```text
codex/<short-feature-name>
```

Before edits, Manager records:

- Files each worker owns.
- Files that require sequencing.
- Tests each worker is expected to update.

## 5. Implementation

Workers edit within scope and keep changes small.

Rules:

- Follow existing AlphaVyuh patterns.
- Do not introduce new libraries without justification.
- Do not refactor unrelated code.
- Do not touch production credentials or secrets.
- Record blockers immediately.

## 6. QA Review

QA verifies the full user story, not just changed code.

Minimum evidence for code changes:

- Lint.
- Typecheck.
- Relevant unit/backend tests.
- Relevant e2e or browser smoke.
- Screenshots for UI changes.

## 7. Security Review

Security review is required for:

- Auth, login, redirect, session, or route changes.
- Supabase tables, RLS, migrations, or storage changes.
- Broker, billing, data import, or webhook changes.
- Public launch, legal, or user data changes.

Security must check secrets, authorization, data isolation, logging, and abuse cases.

## 8. Deploy Review

Deploy Agent checks:

- CI status.
- Preview deployment status.
- Required env vars.
- Migration requirements.
- Production risk.
- Rollback path.

## 9. Pull Request

Use `/Users/PRASAANTH/alphavyuh/docs/templates/agent-pr-checklist.md`.

The PR must include:

- What changed.
- Why it improves AlphaVyuh.
- Screenshots for UI.
- Test results.
- Risks.
- Owner-gated items.
- Follow-up issues.

## 10. Post-Merge

After merge:

- Pull latest `main`.
- Run a smoke test if the change is user-visible.
- Update docs or issue status.
- Record any production gates that remain.

## Status Lifecycle

```text
planned -> in progress -> ready for QA -> ready for review -> merged
                  \-> blocked
```

Blocked work must include the exact owner input needed.

