# QA And Release Hardening Agent Run

## Goal

Keep the agent development loop moving after the Agent OS merge by hardening the checks agents rely on before product PRs.

## Branch

`codex/agent-qa-release-hardening`

## Agents Used

| Agent | Work | Status | Evidence |
| --- | --- | --- | --- |
| Manager | Integrated the follow-up run after PR #102 merged | Complete | This report |
| Product | Recommended connected scanner/watchlist/chart/journal context as the next product sprint | Complete | Product Agent read-only report |
| QA | Identified stale QA runbook and missing release-readiness gate | Complete | `AGENTS/qa.md`, `test:e2e:release` |
| Deploy/Security | Recommended stronger launch checks and non-secret test env handling | Complete | `scripts/launch-readiness-check.sh` |

## Product Impact

- UX: future agent PRs will be checked against the actual founder-beta flow.
- Latency: no direct runtime change.
- Data trust: backend tests now run as part of launch readiness with safe placeholder env.
- Reliability: release-readiness browser checks are scriptable and launch checks run the full backend suite.
- Launch readiness: dependency audit now passes with pinned `cryptography`.

## Required Closeout

- Done: refreshed QA agent instructions, added a release-specific Playwright config, added `test:e2e:release`, expanded `launch:check`, and pinned `cryptography`.
- Why: agents need reliable, repeatable gates so future product work does not regress auth boundaries, public posture, backend behavior, or dependency safety.
- Learned: release-readiness tests must not run under mock auth, backend tests need safe placeholder Supabase env vars for collection, and launch audits fail on unpinned Python dependencies.
- Improve next: add GitHub Actions coverage for the same PR gate so these checks run automatically without depending on a local Codex session.

## Validation

```text
git diff --check
npm run lint
npm run typecheck
npm run test
npm run test:e2e:release
SUPABASE_URL=https://example.supabase.co SUPABASE_SERVICE_ROLE_KEY=test-service-role-key backend/.venv/bin/python -m pytest backend/tests
backend/.venv/bin/python -m pip_audit -r backend/requirements.txt --disable-pip --no-deps --progress-spinner off
SKIP_BROWSER_SMOKE=1 npm run launch:check
```

## Blockers

- GitHub Project board creation still requires `gh auth refresh -s project`.
- Broker read-only smoke still requires owner-provided broker tokens.
- Production Supabase, billing, live data vendor, and broker order validation remain owner-gated.

## Next Recommended Goal

Create an automated GitHub Actions PR gate that runs the standard agent regression suite on every PR.

