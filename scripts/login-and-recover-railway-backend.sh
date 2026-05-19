#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

echo "AlphaVyuh Railway login + backend recovery"
echo
echo "This helper starts Railway browserless login, waits for owner activation,"
echo "then runs the existing backend recovery and data recovery preflight."
echo

if ! command -v railway >/dev/null 2>&1; then
  echo "Railway CLI is not installed. Install it, then rerun this helper." >&2
  exit 1
fi

if (
  cd "$BACKEND_DIR"
  railway whoami >/dev/null 2>&1
); then
  echo "Railway CLI is already authenticated."
else
  echo "Railway CLI is not authenticated. Starting browserless login ..."
  echo "Open the activation URL printed below, enter the code, then return here."
  echo
  (
    cd "$BACKEND_DIR"
    railway login --browserless
  )
fi

echo
echo "Verifying Railway authentication ..."
(
  cd "$BACKEND_DIR"
  railway whoami
)

echo
echo "Running backend recovery ..."
(
  cd "$ROOT_DIR"
  npm run recover:railway-backend
)

echo
echo "Running production data recovery preflight ..."
(
  cd "$ROOT_DIR"
  npm run check:data-recovery
)
