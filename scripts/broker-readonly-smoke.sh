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
  fi
fi

if [[ -z "$PYTHON_BIN" ]]; then
  echo "No Python interpreter is available."
  exit 2
fi

run_step() {
  local name="$1"
  shift
  echo "== $name =="
  "$@"
  echo
}

BROKER_SMOKE_TARGET="${BROKER_SMOKE_TARGET:-all}"
case "$BROKER_SMOKE_TARGET" in
  all)
    run_step "Kite read-only broker smoke" "$PYTHON_BIN" backend/scripts/test_kite_connection.py "$@"
    run_step "Upstox read-only broker smoke" "$PYTHON_BIN" backend/scripts/test_upstox_connection.py "$@"
    ;;
  kite)
    run_step "Kite read-only broker smoke" "$PYTHON_BIN" backend/scripts/test_kite_connection.py "$@"
    ;;
  upstox)
    run_step "Upstox read-only broker smoke" "$PYTHON_BIN" backend/scripts/test_upstox_connection.py "$@"
    ;;
  *)
    echo "Invalid BROKER_SMOKE_TARGET=$BROKER_SMOKE_TARGET. Use all, kite, or upstox."
    exit 2
    ;;
esac
