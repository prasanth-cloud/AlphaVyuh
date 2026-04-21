#!/usr/bin/env bash
# PostToolUse hook: runs after Claude uses Edit/Write tools.
# Formats the touched file with Prettier and auto-fixes lint issues.
# Keeps CI from tripping on the last-10% of formatting drift.

set -euo pipefail

# Hooks run in a minimal subshell that does not source ~/.zshrc.
# Add common tool paths so bun, bunx, etc. are available.
export PATH="$HOME/.bun/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

# The hook receives the edited file path as $CLAUDE_TOOL_FILE_PATH
FILE="${CLAUDE_TOOL_FILE_PATH:-}"

# No file, nothing to do (e.g. the tool was Bash, not Edit)
if [[ -z "$FILE" ]]; then
  exit 0
fi

# Only format files we actually care about
case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx|*.json|*.md|*.css)
    ;;
  *)
    exit 0
    ;;
esac

# File might have been deleted
if [[ ! -f "$FILE" ]]; then
  exit 0
fi

# Prettier — silent unless it fails
bunx prettier --write "$FILE" > /dev/null 2>&1 || {
  echo "prettier failed on $FILE" >&2
}

# ESLint --fix for JS/TS only
case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx)
    bunx eslint --fix "$FILE" > /dev/null 2>&1 || {
      # Non-fatal: ESLint may surface issues it can't auto-fix.
      # Report them so Claude sees and addresses in the next turn.
      bunx eslint "$FILE" >&2 || true
    }
    ;;
esac

exit 0
