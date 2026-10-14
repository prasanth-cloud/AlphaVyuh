#!/usr/bin/env bash
set -uo pipefail

if [[ "${1:-}" == "--help" ]]; then
  printf '%s\n' 'Run local analytics/auth checks and record every gate, including failures.' \
    'Usage: PYTHON_BIN=backend/.venv/bin/python bash scripts/check-analytics-recovery.sh' \
    'Optional: ALPHAVYUH_QA_DIR sets the report directory (default: test-results/development).' \
    'Installs and deployments are not performed. Hosted-account gates remain NOT_RUN.'
  exit 0
fi
if [[ $# -ne 0 ]]; then
  printf '%s\n' 'Unknown argument; use --help.' >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 2
QA_DIR="${ALPHAVYUH_QA_DIR:-$REPO_ROOT/test-results/development}"
mkdir -p "$QA_DIR" || exit 2
QA_DIR="$(cd "$QA_DIR" && pwd)"
REPORT="$QA_DIR/gates.tsv"
printf 'gate\tstatus\texit_code\telapsed_seconds\tcommand\tevidence\n' > "$REPORT"
FAILURES=0
NOT_RUN=0

record() {
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" "$5" "$6" | tee -a "$REPORT"
}

check() {
  local gate="$1"
  shift
  local started=$SECONDS
  local command
  printf -v command '%q ' "$@"
  if "$@" > "$QA_DIR/$gate.log" 2>&1; then
    record "$gate" PASS 0 "$((SECONDS - started))" "$command" "$gate.log"
  else
    local result=$?
    FAILURES=$((FAILURES + 1))
    record "$gate" FAIL "$result" "$((SECONDS - started))" "$command" "$gate.log"
  fi
}

unavailable() {
  NOT_RUN=$((NOT_RUN + 1))
  record "$1" NOT_RUN - - - "$2"
}

export NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
export NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key
export NEXT_PUBLIC_API_URL=http://localhost:8000
export NEXT_PUBLIC_DATA_MODE=mock NEXT_PUBLIC_ALLOW_MOCK_FALLBACK=true
export NEXT_PUBLIC_FORCE_LIVE_DATA=false PLAYWRIGHT_MOCK_AUTH=false
export SUPABASE_URL=https://example.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=test-service-role-key SUPABASE_JWT_SECRET=playwright-secret
export PUBLIC_SITE_URL= LIVE_URL= NEXT_PUBLIC_SITE_URL= VERCEL_ENV= VERCEL_URL= VERCEL_BRANCH_URL=
export PLAYWRIGHT_ACCESS_URL= PLAYWRIGHT_EXPECT_REAL_DATA= PLAYWRIGHT_SMOKE_SYMBOL=
export PRODUCTION_API_BEARER_TOKEN= PRODUCTION_API_URL= PLAYWRIGHT_SUPABASE_AUTH_COOKIES=
export PLAYWRIGHT_QA_EMAIL=qa@example.invalid PLAYWRIGHT_QA_PASSWORD=local-test-password
export SENTRY_AUTH_TOKEN= SENTRY_ORG= SENTRY_PROJECT= SENTRY_DSN= NEXT_PUBLIC_SENTRY_DSN=
unset PLAYWRIGHT_BASE_URL

git rev-parse HEAD > "$QA_DIR/commit.txt" || exit 2
git status --short > "$QA_DIR/source-status.txt" || exit 2
# Preserve local edits as evidence; the commit alone does not identify a dirty run.
git diff --binary HEAD > "$QA_DIR/source-changes.patch" || exit 2
cp scripts/check-analytics-recovery.sh "$QA_DIR/runner-source.sh" || exit 2
{
  date -u '+UTC %Y-%m-%dT%H:%M:%SZ'
  for runtime in node npm "${PYTHON_BIN:-python3}" initdb pg_ctl psql; do
    if command -v "$runtime" >/dev/null; then
      printf '%s: ' "$runtime"
      "$runtime" --version
    fi
  done
} > "$QA_DIR/runtime.txt" 2>&1
check diff git diff --check
if command -v npm >/dev/null && [[ -d frontend/node_modules ]]; then
  check frontend-lint npm run lint
  check frontend-types-build npm run typecheck
  check frontend-unit npm run test
  check root-audit npm audit --audit-level=moderate
  check frontend-audit npm --prefix frontend audit --audit-level=moderate
  check browser-workflow env PLAYWRIGHT_BASE_URL=http://localhost:3002 \
    npm --prefix frontend exec -- playwright test \
    --output="$QA_DIR/browser-workflow-artifacts" \
    --config=frontend/playwright.mock.config.ts frontend/tests/e2e/journal.spec.ts \
    frontend/tests/e2e/reliability.spec.ts frontend/tests/e2e/layout-smoke.spec.ts \
    frontend/tests/e2e/workflow-mock.spec.ts frontend/tests/e2e/smoke-signed-in.spec.ts
  check browser-auth env PLAYWRIGHT_BASE_URL=http://localhost:3003 PLAYWRIGHT_MOCK_AUTH=false \
    npm --prefix frontend exec -- playwright test \
    --output="$QA_DIR/browser-auth-artifacts" \
    --config=frontend/playwright.release.config.ts frontend/tests/e2e/auth-integration.spec.ts \
    frontend/tests/e2e/auth-callback.spec.ts frontend/tests/e2e/release-readiness.spec.ts
else
  for gate in frontend-lint frontend-types-build frontend-unit root-audit frontend-audit browser-workflow browser-auth; do
    unavailable "$gate" 'npm or installed frontend dependencies missing'
  done
fi

if command -v "${PYTHON_BIN:-python3}" >/dev/null; then
  check backend-unit "${PYTHON_BIN:-python3}" -m pytest backend/tests -q
else
  unavailable backend-unit 'Python runtime missing; set PYTHON_BIN'
fi
check service-role-boundaries bash scripts/check-service-role-usage.sh
if command -v initdb >/dev/null && command -v pg_ctl >/dev/null \
  && command -v psql >/dev/null && command -v python3 >/dev/null && command -v rg >/dev/null; then
  check database-bootstrap bash scripts/test-new-project-schema.sh
else
  unavailable database-bootstrap 'PostgreSQL17 tools, python3, and ripgrep required'
fi

unavailable hosted-signup 'User-created password, email confirmation, and signed-in session required'
unavailable hosted-api 'Restored backend, secure server configuration, and actual user session required'
unavailable market-history 'Licensed EOD ingestion and measured coverage/capacity required'
printf 'Report: %s\n' "$REPORT"
if [[ $FAILURES -gt 0 ]]; then exit 1; fi
if [[ $NOT_RUN -gt 0 ]]; then exit 2; fi
