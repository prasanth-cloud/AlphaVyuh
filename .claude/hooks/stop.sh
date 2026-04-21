#!/usr/bin/env bash
# Stop hook: runs when Claude thinks it's finished.
# Deterministic gate — typecheck must pass before the agent can stop.
# If it fails, Claude gets the errors and loops back to fix them.

set -euo pipefail

# Add common bun/tool install locations. Hooks don't source ~/.zshrc.
export PATH="$HOME/.bun/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"

cd "${CLAUDE_PROJECT_DIR:-.}"

# Skip if there's no package.json (not in the project root for some reason)
if [[ ! -f package.json ]]; then
  exit 0
fi

run_typecheck() {
  if command -v bun &>/dev/null; then
    bun run typecheck
  elif [[ -x "frontend/node_modules/.bin/tsc" ]]; then
    cd frontend && node_modules/.bin/tsc --noEmit
  elif command -v npx &>/dev/null; then
    cd frontend && npx --yes tsc --noEmit
  else
    echo "⚠ typecheck skipped — neither bun nor tsc found" >&2
    return 0
  fi
}

# Run typecheck. On failure, emit errors to stderr and exit non-zero
# so Claude Code surfaces it and continues the turn.
if ! run_typecheck 2>/tmp/alphavyuh-typecheck.log; then
  echo "✗ typecheck failed — agent cannot stop yet" >&2
  echo "---" >&2
  cat /tmp/alphavyuh-typecheck.log >&2
  exit 1
fi

exit 0
