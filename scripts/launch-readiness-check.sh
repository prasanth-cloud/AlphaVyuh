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

# Backend tests import settings during collection. Use explicit non-secret
# placeholders when local/CI environments have no Supabase credentials.
export SUPABASE_URL="${SUPABASE_URL:-https://example.supabase.co}"
export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-test-service-role-key}"

run_step() {
  local name="$1"
  shift
  echo "== $name =="
  "$@"
  echo
}

run_step "Git tracked changes" git status --short

run_step "Frontend lint" npm --prefix frontend run lint
run_step "Frontend typecheck" npm --prefix frontend run typecheck
run_step "Frontend unit tests" npm --prefix frontend run test
run_step "Frontend production build" npm --prefix frontend run build
run_step "Frontend dependency audit" npm audit --audit-level=moderate

if [[ "${SKIP_BROWSER_SMOKE:-}" == "1" ]]; then
  echo "Skipping browser smoke checks because SKIP_BROWSER_SMOKE=1."
  echo
else
  run_step "Mock workflow browser smoke" npm run test:e2e:mock
  run_step "Mock workflow performance smoke" npm run test:e2e:perf
  run_step "Mock workflow layout smoke" npm run test:e2e:layout
  run_step "Release readiness browser smoke" npm run test:e2e:release
  run_step "Live backend HTTP smoke" npm run test:e2e:backend
fi

if [[ -d backend ]]; then
  if [[ -n "$PYTHON_BIN" ]]; then
    run_step "Backend tests" "$PYTHON_BIN" -m pytest backend/tests
  else
    echo "Skipping backend tests: no Python interpreter is available."
    echo
  fi
fi

if [[ -n "$PYTHON_BIN" ]] && "$PYTHON_BIN" -m pip_audit --version >/dev/null 2>&1; then
  run_step "Backend dependency audit" "$PYTHON_BIN" -m pip_audit -r backend/requirements.txt --disable-pip --no-deps --progress-spinner off
else
  echo "Skipping backend dependency audit: pip-audit is not installed."
  if [[ -n "$PYTHON_BIN" ]]; then
    echo "Install with: $PYTHON_BIN -m pip install pip-audit"
  fi
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

if [[ "${PRODUCTION_API_URL:-${NEXT_PUBLIC_API_URL:-}}" != "" ]]; then
  run_step "Production API data smoke" npm run check:production-api
else
  echo "Skipping production API data smoke. Set PRODUCTION_API_URL or NEXT_PUBLIC_API_URL to enable it."
  echo
fi

if [[ "${RUN_PRODUCTION_RECOVERY_SMOKE:-}" == "1" ]]; then
  run_step "Production data recovery preflight" npm run check:data-recovery
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
