#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "== AlphaVyuh launch readiness check =="
echo "Root: $ROOT"
echo

PYTHON_BIN="${PYTHON_BIN:-}"
if [[ -z "$PYTHON_BIN" ]]; then
  if [[ -x "$ROOT/backend/.venv/bin/python" ]]; then
    PYTHON_BIN="$ROOT/backend/.venv/bin/python"
  elif command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
  fi
fi

PYTEST_CMD=()
if [[ -n "$PYTHON_BIN" ]] && "$PYTHON_BIN" -m pytest --version >/dev/null 2>&1; then
  PYTEST_CMD=("$PYTHON_BIN" -m pytest)
elif command -v uv >/dev/null 2>&1; then
  PYTEST_CMD=(uv run --with-requirements backend/requirements.txt python -m pytest)
fi

PIP_AUDIT_CMD=()
if [[ -n "$PYTHON_BIN" ]] && "$PYTHON_BIN" -m pip_audit --version >/dev/null 2>&1; then
  PIP_AUDIT_CMD=("$PYTHON_BIN" -m pip_audit)
elif command -v uv >/dev/null 2>&1; then
  PIP_AUDIT_CMD=(uv run --with-requirements backend/requirements.txt --with pip-audit python -m pip_audit)
fi

# Backend tests import settings during collection. Use explicit non-secret
# placeholders when local/CI environments have no Supabase credentials.
export SUPABASE_URL="${SUPABASE_URL:-https://example.supabase.co}"
export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-test-service-role-key}"

run_step() {
  local name="$1"
  shift
  echo "== $name =="
  node "$ROOT/scripts/run-command-with-timeout.mjs" \
    --name "$name" \
    --timeout "${STEP_TIMEOUT_SECONDS:-900}" \
    -- "$@"
  echo
}

run_step "Git tracked changes" git status --short

run_step "Launch checker regression tests" npm run test:production-api-check
run_step "Launch readiness runner regression tests" npm run test:launch-readiness-script
run_step "Five-year chart contract regression tests" npm run test:five-year-chart-check
run_step "Production smoke env regression tests" npm run test:production-smoke-env-check
run_step "Production smoke workflow regression tests" npm run test:production-smoke-workflow-check
run_step "Railway recovery workflow regression tests" npm run test:railway-recovery-workflow-check
run_step "Railway recovery script regression tests" npm run test:railway-recovery-script
run_step "Recovery handoff credential regression tests" npm run test:recovery-handoff-credentials-check
run_step "Signed-in copy posture regression tests" npm run test:signed-in-copy-posture-check
run_step "Public posture checker regression tests" npm run test:public-posture-check
run_step "Data recovery checker regression tests" npm run test:data-recovery-check
run_step "Market-data entitlement contract regression tests" npm run test:market-data-entitlement-check
run_step "Setup review workflow contract regression tests" npm run test:setup-review-check
run_step "Sector taxonomy checker regression tests" npm run test:sector-taxonomy-check
run_step "Broker read-only contract regression tests" npm run test:broker-readonly-check
run_step "Railway secret prep regression tests" npm run test:railway-secret-prep

run_step "Frontend lint" npm --prefix frontend run lint
run_step "Frontend typecheck" npm --prefix frontend run typecheck
run_step "Frontend unit tests" bash -lc "cd frontend && npm run test"
run_step "Frontend production build" npm --prefix frontend run build
run_step "Frontend dependency audit" npm --prefix frontend audit --audit-level=moderate

if [[ "${SKIP_BROWSER_SMOKE:-}" == "1" ]]; then
  echo "Skipping browser smoke checks because SKIP_BROWSER_SMOKE=1."
  echo
else
  run_step "Mock workflow browser smoke" npm run test:e2e:mock
  run_step "Signed-in workflow browser smoke" npm run test:e2e:smoke
  run_step "Mock workflow performance smoke" npm run test:e2e:perf
  run_step "Mock workflow layout smoke" npm run test:e2e:layout
  run_step "Release readiness browser smoke" npm run test:e2e:release
  run_step "Live backend HTTP smoke" npm run test:e2e:backend
fi

if [[ -d backend ]]; then
  if [[ ${#PYTEST_CMD[@]} -gt 0 ]]; then
    run_step "Backend tests" "${PYTEST_CMD[@]}" backend/tests
  else
    echo "Skipping backend tests: neither a pytest-enabled Python interpreter nor uv is available."
    echo
  fi
fi

if [[ ${#PIP_AUDIT_CMD[@]} -gt 0 ]]; then
  run_step "Backend dependency audit" "${PIP_AUDIT_CMD[@]}" -r backend/requirements.txt --disable-pip --no-deps --progress-spinner off
else
  echo "Skipping backend dependency audit: neither pip-audit nor uv is available."
  echo
fi

if [[ "${RUN_BROKER_SMOKE:-}" == "1" ]]; then
  run_step "Read-only broker smoke" bash scripts/broker-readonly-smoke.sh
else
  echo "Skipping read-only broker smoke. Set RUN_BROKER_SMOKE=1 when broker tokens are available."
  echo "Use BROKER_SMOKE_TARGET=kite, upstox, or all to choose the account smoke target."
  echo
fi

if [[ "${LIVE_URL:-}" != "" ]]; then
  run_step "Live public posture check" npm run check:public-posture
else
  echo "Skipping live URL check. Set LIVE_URL=https://www.alphavyuh.com to enable it."
  echo
fi

run_step "Signed-in copy posture check" npm run check:signed-in-copy-posture
run_step "Recovery handoff credential check" npm run check:recovery-handoff-credentials
run_step "Production smoke workflow check" npm run check:production-smoke-workflow
run_step "Railway recovery workflow check" npm run check:railway-recovery-workflow

if [[ "${PRODUCTION_API_URL:-${NEXT_PUBLIC_API_URL:-}}" != "" ]]; then
  run_step "Production API data smoke" npm run check:production-api
  run_step "Production sector taxonomy smoke" npm run check:sector-taxonomy
else
  echo "Skipping production API data smoke. Set PRODUCTION_API_URL or NEXT_PUBLIC_API_URL to enable it."
  echo "Skipping production sector taxonomy smoke. Set PRODUCTION_API_URL, NEXT_PUBLIC_API_URL, SECTOR_AUDIT_URL, PUBLIC_SITE_URL, or LIVE_URL to enable it."
  echo
fi

if [[ "${RUN_PRODUCTION_RECOVERY_SMOKE:-}" == "1" ]]; then
  run_step "Production signed-in smoke env preflight" npm run check:production-smoke-env
  run_step "Production data recovery preflight" env REQUIRE_AUTHENTICATED_SMOKE=1 npm run check:data-recovery
  run_step "Production signed-in browser smoke" npm run test:e2e:prod:smoke
else
  echo "Skipping production recovery smoke. Set RUN_PRODUCTION_RECOVERY_SMOKE=1 after Railway recovery to run data recovery and signed-in production browser smoke."
  echo
fi

if [[ "${RUN_RAILWAY_BACKEND_RECOVERY:-}" == "1" ]]; then
  run_step "Railway backend recovery" npm run recover:railway-backend
else
  echo "Skipping Railway backend recovery. Set RUN_RAILWAY_BACKEND_RECOVERY=1 after railway login to deploy and verify the backend."
  echo
fi

echo "Launch readiness check complete."
