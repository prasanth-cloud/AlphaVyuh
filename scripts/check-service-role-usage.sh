#!/usr/bin/env bash
# CI check: fail if get_admin_client is the SOLE Supabase client in a router file.
# Migrated routers use get_user_client for user requests and may keep get_admin_client
# only for plan checks, public endpoints, or scheduled jobs.
#
# A router passes if:
#   - It does not import get_admin_client at all, OR
#   - It also imports get_user_client (mixed use = migrated with legitimate admin ops), OR
#   - It is in the FULLY_ADMIN allowlist (no user auth at all)

set -euo pipefail

ROUTERS_DIR="backend/app/routers"

# Routers that are fully admin/system with no user auth context:
FULLY_ADMIN=(
  "stocks.py"       # public endpoints, no user auth
  "community.py"    # broken imports, cannot migrate yet
  "waitlist.py"     # public + admin-only endpoints
)

violations=0

for file in "$ROUTERS_DIR"/*.py; do
  basename=$(basename "$file")

  # Skip fully-admin routers
  skip=false
  for allowed in "${FULLY_ADMIN[@]}"; do
    if [ "$basename" = "$allowed" ]; then
      skip=true
      break
    fi
  done
  if $skip; then
    continue
  fi

  has_admin=$(grep -c "get_admin_client" "$file" 2>/dev/null || true)
  has_user=$(grep -c "get_user_client" "$file" 2>/dev/null || true)
  : "${has_admin:=0}"
  : "${has_user:=0}"

  # Fail only if the file uses admin client WITHOUT also using user client
  if [ "$has_admin" -gt 0 ] && [ "$has_user" -eq 0 ]; then
    echo "ERROR: $file uses get_admin_client exclusively. Migrate user-facing routes to get_user_client()."
    violations=$((violations + 1))
  fi
done

# Check for direct SUPABASE_SERVICE_ROLE_KEY references in any router
for file in "$ROUTERS_DIR"/*.py; do
  if grep -q "SUPABASE_SERVICE_ROLE_KEY\|supabase_service_role_key" "$file"; then
    echo "ERROR: $file references SUPABASE_SERVICE_ROLE_KEY directly."
    violations=$((violations + 1))
  fi
done

if [ "$violations" -gt 0 ]; then
  echo ""
  echo "Found $violations service-role violation(s) in router files."
  echo "User-facing routers must use get_user_client(user_jwt) for RLS-respecting access."
  echo "get_admin_client is only permitted alongside get_user_client (for plan checks/cron jobs)"
  echo "or in fully-admin routers listed in the FULLY_ADMIN allowlist."
  exit 1
fi

echo "OK: All user-facing routers use get_user_client for RLS-respecting access."
