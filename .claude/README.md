# .claude/

Shared Claude Code configuration for this repo. Checked in on purpose — every team member (and every Claude session on every machine) picks up the same conventions.

## Contents

- **`settings.json`** — pre-approved bash commands, status line, hook wiring. Editing `allow`/`deny` is a team decision; open a PR.
- **`agents/`** — subagents you can invoke with `/agents <name>` or by saying *"use the <name> subagent"*:
  - `code-simplifier` — cleanup pass after a feature works
  - `verify-app` — full verification before declaring done
  - `reviewer` — skeptical code review before you open a PR
- **`hooks/`** — shell scripts that fire on Claude Code lifecycle events:
  - `post-tool-use.sh` — formats/lints files Claude just edited
  - `stop.sh` — typecheck gate before the agent can finish

## When to change things here

- **Adding a new allowed bash command:** common friction → add to `settings.json` `allow`.
- **New recurring workflow:** write a subagent in `agents/`.
- **New formatting/validation step:** add to `hooks/post-tool-use.sh`.
- **Want stricter "done" criteria:** extend `hooks/stop.sh`.

## MCP servers

MCP config lives in the repo root at `.mcp.json`, not here — that's where Claude Code looks.

## Don't

- Don't commit secrets. Hooks read env, don't bake keys in.
- Don't disable the stop hook to get a task through faster. Fix the error instead.
