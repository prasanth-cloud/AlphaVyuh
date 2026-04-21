#!/usr/bin/env bash
# Stop hook: runs when Claude thinks it's finished.
# Deterministic gate — typecheck must pass before the agent can stop.
# If it fails, Claude gets the errors and loops back to fix them.

set -euo pipefail

# Hooks run in a minimal subshell that does not source ~/.zshrc.
# Add common tool paths so bun, bunx, etc. are available.
export PATH="$HOME/.bun/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

cd "${CLAUDE_PROJECT_DIR:-.}"

# Skip if there's no package.json (not in the project root for some reason)
if [[ ! -f package.json ]]; then
  exit 0
fi

# Run typecheck. On failure, emit errors to stderr and exit non-zero
# so Claude Code surfaces it and continues the turn.
if ! bun run typecheck 2> /tmp/alphavyuh-typecheck.log; then
  echo "✗ typecheck failed — agent cannot stop yet" >&2
  echo "---" >&2
  cat /tmp/alphavyuh-typecheck.log >&2
  exit 1
fi

exit 0
