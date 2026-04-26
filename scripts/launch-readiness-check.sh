#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "== AlphaVyuh launch readiness check =="
echo "Root: $ROOT"
echo

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
  if command -v python3 >/dev/null 2>&1; then
    run_step "Backend focused tests" python3 -m pytest \
      backend/tests/test_market_data_provider.py \
      backend/tests/test_payments.py \
      backend/tests/test_rate_limit.py \
      backend/tests/test_credentials.py
  else
    echo "Skipping backend tests: python3 is not available."
    echo
  fi
fi

if python3 -m pip_audit --version >/dev/null 2>&1; then
  run_step "Backend dependency audit" python3 -m pip_audit -r backend/requirements.txt --disable-pip --no-deps --progress-spinner off
else
  echo "Skipping backend dependency audit: pip-audit is not installed."
  echo "Install with: python3 -m pip install pip-audit"
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
