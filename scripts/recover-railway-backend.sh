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

project_args=()
if [[ -n "$RAILWAY_PROJECT_ID" ]]; then
  project_args=(--project "$RAILWAY_PROJECT_ID")
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

link_required=1
if [[ -n "${RAILWAY_TOKEN:-}" && -n "$RAILWAY_PROJECT_ID" ]]; then
  link_required=0
  echo "Railway token and project ID detected; deploying with explicit project flags."
fi

if ! command -v railway >/dev/null 2>&1; then
  echo "Railway CLI is not installed. Install it, then rerun this script." >&2
  exit 1
fi

linked_for_recovery=0
if [[ -n "$RAILWAY_PROJECT_ID" ]]; then
  echo "Linking Railway project before recovery ..."
  if (
    cd "$BACKEND_DIR"
    railway link "${link_args[@]}"
  ); then
    linked_for_recovery=1
  elif [[ "$link_required" == "0" ]]; then
    echo "Railway project link failed, but explicit project flags are available; continuing with direct deploy." >&2
    echo "Railway deployment status wait will be skipped for this run." >&2
  else
    echo "Railway project link failed and no explicit token/project deploy path is available." >&2
    exit 1
  fi
fi

if [[ "$link_required" == "1" ]]; then
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
fi

wait_for_railway_deployment() {
  local deploy_message="$1"
  local deployment_info=""
  local deployment_id=""
  local deployment_status=""
  local deployment_created_at=""
  local status_file="/tmp/alphavyuh-railway-deployments.json"
  local status_err="/tmp/alphavyuh-railway-deployments.err"

  if [[ "$linked_for_recovery" != "1" ]]; then
    echo "Skipping Railway deployment status wait because no Railway project is linked in this run."
    return 0
  fi

  echo "Waiting for Railway deployment to complete ..."
  for attempt in {1..90}; do
    if (
      cd "$BACKEND_DIR"
      railway deployment list --json --limit 20 --environment "$RAILWAY_ENVIRONMENT" ${service_args[@]+"${service_args[@]}"}
    ) >"$status_file" 2>"$status_err"; then
      deployment_info="$(node - "$deploy_message" "$status_file" <<'NODE'
const [deployMessage, statusFile] = process.argv.slice(2);
const fs = require("node:fs");
const deployments = JSON.parse(fs.readFileSync(statusFile, "utf8"));
const deployment =
  deployments.find((candidate) => candidate?.meta?.cliMessage === deployMessage) ||
  deployments[0];
if (!deployment) process.exit(2);
process.stdout.write([
  deployment.id || "",
  deployment.status || "",
  deployment.createdAt || "",
].join("\t"));
NODE
)"
      IFS=$'\t' read -r deployment_id deployment_status deployment_created_at <<<"$deployment_info"

      if [[ -n "$deployment_id" ]]; then
        echo "Railway deployment $deployment_id status: $deployment_status ($deployment_created_at)"
      fi

      case "$deployment_status" in
        SUCCESS)
          return 0
          ;;
        FAILED|CRASHED|REMOVED)
          echo "Railway deployment $deployment_id failed. Build logs:" >&2
          (
            cd "$BACKEND_DIR"
            railway logs "$deployment_id" --build --lines 120 --environment "$RAILWAY_ENVIRONMENT" ${service_args[@]+"${service_args[@]}"} || true
          ) >&2
          echo "Deployment logs:" >&2
          (
            cd "$BACKEND_DIR"
            railway logs "$deployment_id" --deployment --lines 120 --environment "$RAILWAY_ENVIRONMENT" ${service_args[@]+"${service_args[@]}"} || true
          ) >&2
          return 1
          ;;
      esac
    else
      cat "$status_err" >&2 || true
    fi

    echo "Railway deployment not ready yet ($attempt/90)."
    sleep 10
  done

  echo "Timed out waiting for Railway deployment to complete." >&2
  return 1
}

if [[ "$SKIP_RAILWAY_DEPLOY" != "1" ]]; then
  echo "Deploying backend from $BACKEND_DIR ..."
  deploy_message="Recover AlphaVyuh backend $(git -C "$ROOT_DIR" rev-parse --short HEAD)"
  (
    cd "$BACKEND_DIR"
    railway up \
      --detach \
      --environment "$RAILWAY_ENVIRONMENT" \
      ${project_args[@]+"${project_args[@]}"} \
      ${service_args[@]+"${service_args[@]}"} \
      --message "$deploy_message"
  )
  wait_for_railway_deployment "$deploy_message"
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
  if [[ "$link_required" == "1" ]]; then
    (
      cd "$BACKEND_DIR"
      railway logs --latest --lines 80 --environment "$RAILWAY_ENVIRONMENT" ${service_args[@]+"${service_args[@]}"} || true
    )
  elif [[ "$linked_for_recovery" == "1" ]]; then
    (
      cd "$BACKEND_DIR"
      railway logs --latest --lines 80 --environment "$RAILWAY_ENVIRONMENT" ${service_args[@]+"${service_args[@]}"} || true
    )
  else
    echo "Skipping Railway log fetch because this run used explicit project flags without a linked workspace." >&2
  fi
  exit 1
fi

echo "Health response:"
cat /tmp/alphavyuh-health.json
echo

if [[ -n "${PRODUCTION_API_BEARER_TOKEN:-${PRODUCTION_API_AUTH_TOKEN:-}}" ]]; then
  echo "Production API smoke will include authenticated scanner verification."
else
  echo "Production API smoke will skip authenticated scanner verification. Set PRODUCTION_API_BEARER_TOKEN to verify scanner data."
fi

echo "Waiting for production API contract smoke to pass ..."
production_smoke_ok=0
for attempt in {1..30}; do
  if (
    cd "$ROOT_DIR"
    PRODUCTION_API_URL="$PRODUCTION_API_URL" \
      PRODUCTION_API_BEARER_TOKEN="${PRODUCTION_API_BEARER_TOKEN:-}" \
      PRODUCTION_API_AUTH_TOKEN="${PRODUCTION_API_AUTH_TOKEN:-}" \
      npm run check:production-api
  ); then
    production_smoke_ok=1
    break
  fi

  echo "Production API contract smoke not ready yet ($attempt/30)."
  sleep 10
done

if [[ "$production_smoke_ok" != "1" ]]; then
  echo "Production API contract smoke did not pass after Railway deploy. Latest Railway logs:" >&2
  if [[ "$link_required" == "1" ]]; then
    (
      cd "$BACKEND_DIR"
      railway logs --latest --lines 80 --environment "$RAILWAY_ENVIRONMENT" ${service_args[@]+"${service_args[@]}"} || true
    )
  elif [[ "$linked_for_recovery" == "1" ]]; then
    (
      cd "$BACKEND_DIR"
      railway logs --latest --lines 80 --environment "$RAILWAY_ENVIRONMENT" ${service_args[@]+"${service_args[@]}"} || true
    )
  else
    echo "Skipping Railway log fetch because this run used explicit project flags without a linked workspace." >&2
  fi
  exit 1
fi
