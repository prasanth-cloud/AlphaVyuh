#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

run_step() {
  local name="$1"
  shift
  echo "== $name =="
  "$@"
  echo
}

run_step "Setup review unit contract tests" \
  npm --prefix frontend run test -- \
    scanner-workflow.test.ts \
    scanner-review-context.test.ts \
    multi-chart-review.test.ts \
    chart-review-timeframes.test.ts \
    watchlist-chart-range.test.ts

if [[ "${SKIP_BROWSER_SMOKE:-}" == "1" ]]; then
  echo "Skipping setup review browser workflow smoke because SKIP_BROWSER_SMOKE=1."
  echo
else
  run_step "Setup review browser workflow smoke" \
    npm --prefix frontend exec -- playwright test \
      --config=frontend/playwright.mock.config.ts \
      frontend/tests/e2e/workflow-mock.spec.ts \
      -g "multi-chart review board compares scanner candidates"
fi

echo "Setup review contract checks complete."
