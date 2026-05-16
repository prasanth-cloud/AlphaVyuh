# Agent OS V1 Pilot Run

## Pilot Goal

Create the first AlphaVyuh Agent Operating System so future work can be split across specialized agents, tracked through GitHub, verified with tests, and opened as PRs.

## Manager Plan

| Agent | Assigned scope | Output |
| --- | --- | --- |
| Product | Define what agent work must improve for traders | Mission Control quality bar and impact metrics |
| Manager | Define universal rules and workflow | `AGENTS.md`, workflow doc, blocker ledger |
| QA | Define verification evidence expected for agent-built PRs | PR checklist and run report template |
| Security | Define approval gates and unsafe actions | Human approval matrix and blocker rules |
| Deploy | Define release-readiness tracking | Mission Control fields and deploy evidence expectations |

## Acceptance Criteria

- [x] Global agent rules exist.
- [x] Agent roles are documented.
- [x] Agent workflow is documented.
- [x] Feature spec template exists.
- [x] PR checklist exists.
- [x] Run report template exists.
- [x] GitHub issue templates exist for agent work.
- [x] Labels are defined for role, status, impact, and risk.
- [x] Blockers ledger exists.

## Result

This pilot produced the documentation and GitHub metadata needed to run future AlphaVyuh goals through Manager, Product, Frontend, Backend/Data, QA, Security, and Deploy agents.

## Remaining Risks

- GitHub labels must be applied by a human or a future automation step.
- GitHub Project views must be created in the GitHub UI unless a project automation is added later.
- Real multi-agent execution still depends on Codex sessions or a future orchestration service.

## Next Recommended Pilot

Run the next product change through this workflow:

```text
Goal: Polish Full Chart controls and chart-data trust for founder beta.

Agents:
- Product defines the clean chart workflow and acceptance criteria.
- Frontend owns chart controls and dropdowns.
- Backend/Data owns candle history and intraday data honesty.
- QA owns full chart and watchlist chart regression tests.
- Security reviews no new unsafe data or broker paths.
- Deploy verifies preview and smoke tests.
```

