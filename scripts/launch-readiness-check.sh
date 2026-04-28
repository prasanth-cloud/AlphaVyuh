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

run_step() {
  local name="$1"
  shift
  echo "== $name =="
  "$@"
  echo
}

run_step "Git tracked changes" git status --short

run_step "Frontend lint" npm --prefix frontend run lint
run_step "Frontend unit tests" npm --prefix frontend run test
run_step "Frontend production build" npm --prefix frontend run build

if [[ -d backend ]]; then
  if [[ -n "$PYTHON_BIN" ]]; then
    run_step "Backend focused tests" "$PYTHON_BIN" -m pytest \
      backend/tests/test_market_data_provider.py \
      backend/tests/test_payments.py \
      backend/tests/test_rate_limit.py \
      backend/tests/test_credentials.py
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

if [[ "${LIVE_URL:-}" != "" ]]; then
  run_step "Live landing workflow check" bash -c \
    "curl -sSL '${LIVE_URL}' | rg 'Five steps|Scan|Watchlist|Chart|Order|Review'"
else
  echo "Skipping live URL check. Set LIVE_URL=https://www.alphavyuh.com to enable it."
  echo
fi

echo "Launch readiness check complete."
