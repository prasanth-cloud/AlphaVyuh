#!/usr/bin/env bash
# CI check: prevent new service-role usage in user-facing router files.
#
# The repository still has legacy routers that use get_admin_client exclusively.
# They are migration debt, but they must not make every unrelated backend PR fail.
# In CI, compare the changed router files with SERVICE_ROLE_BASE_REF and fail only
# when a PR adds admin-client or direct service-role-key usage without adding a
# user-scoped client. Without a base ref, scan the full tree for local auditing.
#
# A changed router passes if:
#   - It does not add get_admin_client usage, OR
#   - It also uses get_user_client (mixed use = migrated with legitimate admin ops), OR
#   - It is in the FULLY_ADMIN allowlist (no user auth at all).

set -euo pipefail

ROUTERS_DIR="backend/app/routers"
BASE_REF="${SERVICE_ROLE_BASE_REF:-}"

# Routers that are fully admin/system with no user auth context:
FULLY_ADMIN=(
  "stocks.py"       # public endpoints, no user auth
  "community.py"    # broken imports, cannot migrate yet
  "waitlist.py"     # public + admin-only endpoints
)

violations=0

if [ -n "$BASE_REF" ]; then
  if ! git cat-file -e "$BASE_REF^{commit}" 2>/dev/null; then
    echo "ERROR: SERVICE_ROLE_BASE_REF '$BASE_REF' is not available in this checkout."
    echo "Use actions/checkout with fetch-depth: 0 or fetch the base commit explicitly."
    exit 1
  fi

  router_files=$(git diff --name-only --diff-filter=ACMR "$BASE_REF" HEAD -- "$ROUTERS_DIR/*.py")
else
  router_files=$(find "$ROUTERS_DIR" -maxdepth 1 -type f -name '*.py' | sort)
fi

count_in_file() {
  local pattern="$1"
  local file="$2"
  grep -c -E "$pattern" "$file" 2>/dev/null || true
}

count_in_base() {
  local pattern="$1"
  local file="$2"

  if [ -z "$BASE_REF" ] || ! git cat-file -e "$BASE_REF:$file" 2>/dev/null; then
    echo 0
    return
  fi

  git show "$BASE_REF:$file" | grep -c -E "$pattern" || true
}

for file in $router_files; do
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

  has_admin=$(count_in_file "get_admin_client" "$file")
  has_user=$(count_in_file "get_user_client" "$file")
  base_admin=$(count_in_base "get_admin_client" "$file")
  : "${has_admin:=0}"
  : "${has_user:=0}"
  : "${base_admin:=0}"

  # Existing admin-only usage is migration debt. Fail when a changed file adds
  # more of it without introducing the RLS-respecting client.
  if [ "$has_admin" -gt "$base_admin" ] && [ "$has_user" -eq 0 ]; then
    echo "ERROR: $file adds get_admin_client usage without get_user_client()."
    violations=$((violations + 1))
  fi

  direct_keys=$(count_in_file "SUPABASE_SERVICE_ROLE_KEY|supabase_service_role_key" "$file")
  base_direct_keys=$(count_in_base "SUPABASE_SERVICE_ROLE_KEY|supabase_service_role_key" "$file")
  : "${direct_keys:=0}"
  : "${base_direct_keys:=0}"

  if [ "$direct_keys" -gt "$base_direct_keys" ]; then
    echo "ERROR: $file adds a direct service-role-key reference."
    violations=$((violations + 1))
  fi
done

if [ "$violations" -gt 0 ]; then
  echo ""
  echo "Found $violations new service-role violation(s) in changed router files."
  echo "User-facing router changes must use get_user_client(user_jwt) for RLS-respecting access."
  echo "get_admin_client is only permitted alongside get_user_client (for plan checks/cron jobs)"
  echo "or in fully-admin routers listed in the FULLY_ADMIN allowlist."
  exit 1
fi

if [ -n "$BASE_REF" ]; then
  echo "OK: Changed routers add no unscoped service-role usage."
else
  echo "OK: Full-tree audit found no unscoped service-role usage."
fi
