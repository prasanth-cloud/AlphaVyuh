#!/usr/bin/env bash
# PostToolUse hook: runs after Claude uses Edit/Write tools.
# Formats the touched file with Prettier and auto-fixes lint issues.
# Keeps CI from tripping on the last-10% of formatting drift.

set -euo pipefail

# Add common bun/tool install locations. Hooks don't source ~/.zshrc.
export PATH="$HOME/.bun/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"

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

# Resolve prettier — prefer bunx, fall back to frontend/node_modules, skip if absent
run_prettier() {
  if command -v bunx &>/dev/null; then
    bunx prettier --write "$FILE" > /dev/null 2>&1
  elif [[ -x "${CLAUDE_PROJECT_DIR:-.}/frontend/node_modules/.bin/prettier" ]]; then
    "${CLAUDE_PROJECT_DIR:-.}/frontend/node_modules/.bin/prettier" --write "$FILE" > /dev/null 2>&1
  else
    return 0  # prettier not available — skip silently
  fi
}

run_prettier || echo "prettier failed on $FILE" >&2

# ESLint --fix for JS/TS only
case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx)
    if command -v bunx &>/dev/null; then
      bunx eslint --fix "$FILE" > /dev/null 2>&1 || bunx eslint "$FILE" >&2 || true
    elif [[ -x "${CLAUDE_PROJECT_DIR:-.}/frontend/node_modules/.bin/eslint" ]]; then
      ESLINT="${CLAUDE_PROJECT_DIR:-.}/frontend/node_modules/.bin/eslint"
      "$ESLINT" --fix "$FILE" > /dev/null 2>&1 || "$ESLINT" "$FILE" >&2 || true
    fi
    ;;
esac

exit 0
