#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PYTHON_BIN="${PYTHON_BIN:-}"
if [[ -z "$PYTHON_BIN" ]]; then
  if [[ -x "$ROOT/backend/.venv/bin/python" ]]; then
    PYTHON_BIN="$ROOT/backend/.venv/bin/python"
  elif command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
  elif command -v python >/dev/null 2>&1; then
    PYTHON_BIN="python"
  fi
fi

if [[ -z "$PYTHON_BIN" ]]; then
  echo "No Python interpreter is available."
  exit 2
fi

PYTEST_CMD=("$PYTHON_BIN" -m pytest)
if ! "$PYTHON_BIN" -m pytest --version >/dev/null 2>&1; then
  if command -v uv >/dev/null 2>&1; then
    PYTEST_CMD=(uv run --with-requirements backend/requirements.txt python -m pytest)
  else
    echo "Pytest is not installed for $PYTHON_BIN and uv is not available."
    exit 2
  fi
fi

# Backend tests import settings during collection. Use explicit non-secret
# placeholders when local/CI environments have no Supabase or broker vault keys.
export SUPABASE_URL="${SUPABASE_URL:-https://example.supabase.co}"
export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-test-service-role-key}"
export BROKER_CREDS_KEY="${BROKER_CREDS_KEY:-0000000000000000000000000000000000000000000000000000000000000000}"

run_step() {
  local name="$1"
  shift
  echo "== $name =="
  "$@"
  echo
}

run_step "Broker safety frontend copy tests" \
  npm --prefix frontend run test -- tests/unit/broker-safety.test.ts

run_step "Broker read-only backend safety tests" \
  "${PYTEST_CMD[@]}" backend/tests/test_broker_order_safety.py backend/tests/test_brokers_router.py

run_step "Broker real-account smoke script syntax" \
  bash -n scripts/broker-readonly-smoke.sh

echo "Broker read-only contract checks complete."
echo "Real broker account smoke is intentionally separate; run RUN_BROKER_SMOKE=1 npm run launch:check only when owner tokens are available."
