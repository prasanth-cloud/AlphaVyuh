#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
PRODUCTION_API_URL="${PRODUCTION_API_URL:-https://alphavyuh-production.up.railway.app}"
RAILWAY_ENVIRONMENT="${RAILWAY_ENVIRONMENT:-production}"
RAILWAY_SERVICE="${RAILWAY_SERVICE:-}"
RAILWAY_PROJECT_ID="${RAILWAY_PROJECT_ID:-}"
RAILWAY_WORKSPACE="${RAILWAY_WORKSPACE:-}"
SKIP_RAILWAY_DEPLOY="${SKIP_RAILWAY_DEPLOY:-0}"

service_args=()
if [[ -n "$RAILWAY_SERVICE" ]]; then
  service_args=(--service "$RAILWAY_SERVICE")
fi

link_args=()
if [[ -n "$RAILWAY_PROJECT_ID" ]]; then
  link_args+=(--project "$RAILWAY_PROJECT_ID")
fi
if [[ -n "$RAILWAY_WORKSPACE" ]]; then
  link_args+=(--workspace "$RAILWAY_WORKSPACE")
fi
link_args+=(--environment "$RAILWAY_ENVIRONMENT")
if [[ -n "$RAILWAY_SERVICE" ]]; then
  link_args+=(--service "$RAILWAY_SERVICE")
fi

echo "AlphaVyuh Railway backend recovery"
echo "API URL: $PRODUCTION_API_URL"
echo "Environment: $RAILWAY_ENVIRONMENT"
if [[ -n "$RAILWAY_SERVICE" ]]; then
  echo "Service: $RAILWAY_SERVICE"
else
  echo "Service: linked Railway service"
fi

if ! command -v railway >/dev/null 2>&1; then
  echo "Railway CLI is not installed. Install it, then rerun this script." >&2
  exit 1
fi

if [[ -n "$RAILWAY_PROJECT_ID" ]]; then
  echo "Linking Railway project before recovery ..."
  (
    cd "$BACKEND_DIR"
    railway link "${link_args[@]}"
  )
fi

if ! (
  cd "$BACKEND_DIR"
  railway status --json
) >/tmp/alphavyuh-railway-status.json 2>/tmp/alphavyuh-railway-status.err; then
  cat /tmp/alphavyuh-railway-status.err >&2 || true
  echo
  echo "Railway is not ready for deployment from this machine." >&2
  echo "Run 'railway login', then ensure this repo/backend is linked to the AlphaVyuh project." >&2
  echo "If the project is not linked, run 'railway link' from $BACKEND_DIR." >&2
  if [[ -n "${RAILWAY_TOKEN:-}" ]]; then
    echo >&2
    echo "RAILWAY_TOKEN is present, but no linked Railway project/service was usable." >&2
    echo "Known projects visible to this token:" >&2
    railway list --json >&2 || railway list >&2 || true
    echo >&2
    echo "Set RAILWAY_PROJECT_ID and RAILWAY_SERVICE, or pass them to the GitHub workflow inputs." >&2
  fi
  exit 1
fi

if [[ "$SKIP_RAILWAY_DEPLOY" != "1" ]]; then
  echo "Deploying backend from $BACKEND_DIR ..."
  (
    cd "$BACKEND_DIR"
    railway up \
      --detach \
      --environment "$RAILWAY_ENVIRONMENT" \
      "${service_args[@]}" \
      --message "Recover AlphaVyuh backend $(git -C "$ROOT_DIR" rev-parse --short HEAD)" \
      .
  )
else
  echo "Skipping Railway deploy because SKIP_RAILWAY_DEPLOY=1."
fi

echo "Waiting for /health to return a non-fallback response ..."
health_ok=0
for attempt in {1..30}; do
  if curl -fsS --max-time 10 "$PRODUCTION_API_URL/health" >/tmp/alphavyuh-health.json; then
    health_ok=1
    break
  fi
  echo "Health check not ready yet ($attempt/30)."
  sleep 5
done

if [[ "$health_ok" != "1" ]]; then
  echo "Backend health did not recover. Latest Railway logs:" >&2
  (
    cd "$BACKEND_DIR"
    railway logs --latest --lines 80 --environment "$RAILWAY_ENVIRONMENT" "${service_args[@]}" || true
  )
  exit 1
fi

echo "Health response:"
cat /tmp/alphavyuh-health.json
echo

(
  cd "$ROOT_DIR"
  PRODUCTION_API_URL="$PRODUCTION_API_URL" npm run check:production-api
)
