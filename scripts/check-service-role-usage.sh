#!/usr/bin/env bash
# CI check: fail if get_admin_client appears in router files without an exemption.
# Service-role is only permitted in ingest jobs, admin scripts, services, middleware,
# and broker adapters. User-facing routers should use get_user_client(user_jwt).
#
# To migrate a router: replace get_admin_client() with get_user_client(token)
# where token comes from the Authorization header. Then remove it from the
# allowlist below.

set -euo pipefail

ROUTERS_DIR="backend/app/routers"

# Legacy routers that still use service-role — shrink this list over time.
ALLOWED=(
  "ai.py"
  "alerts.py"
  "backtest.py"
  "broker.py"
  "brokers.py"
  "charts.py"
  "community.py"
  "data_health.py"
  "feedback.py"
  "journal.py"
  "market.py"
  "payments.py"
  "price_alerts.py"
  "scanner.py"
  "stocks.py"
  "users.py"
  "waitlist.py"
  "watchlist.py"
  "workflow.py"
)

violations=0

for file in "$ROUTERS_DIR"/*.py; do
  basename=$(basename "$file")

  # Skip allowlisted legacy files
  skip=false
  for allowed in "${ALLOWED[@]}"; do
    if [ "$basename" = "$allowed" ]; then
      skip=true
      break
    fi
  done
  if $skip; then
    continue
  fi

  if grep -q "get_admin_client" "$file"; then
    echo "ERROR: $file uses get_admin_client (service-role). Use get_user_client() instead."
    violations=$((violations + 1))
  fi
done

# Also check for direct SUPABASE_SERVICE_ROLE_KEY references in routers
for file in "$ROUTERS_DIR"/*.py; do
  if grep -q "SUPABASE_SERVICE_ROLE_KEY\|supabase_service_role_key" "$file"; then
    echo "ERROR: $file references SUPABASE_SERVICE_ROLE_KEY directly."
    violations=$((violations + 1))
  fi
done

if [ "$violations" -gt 0 ]; then
  echo ""
  echo "Found $violations service-role violation(s) in router files."
  echo "Service-role is only permitted in ingest jobs, admin scripts, and the allowlist."
  echo "New routers must use get_user_client(user_jwt) for RLS-respecting access."
  exit 1
fi

echo "OK: No new service-role usage in router files."
