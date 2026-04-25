#!/usr/bin/env bash
# deploy-migration.sh — Apply pending Supabase migrations to staging or prod.
#
# Usage:
#   bash scripts/deploy-migration.sh staging
#   bash scripts/deploy-migration.sh prod
#
# Reads STAGING_SUPABASE_DB_URL / PROD_SUPABASE_DB_URL from .env.local.
#
# URL format (Supabase dashboard → Settings → Database → URI):
#   postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
#
# Staging first, always. Never run prod without having run staging first
# and verified the result. See docs/environments.md for the full flow.

set -euo pipefail

# ── Helpers ──────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GRN='\033[0;32m'
YEL='\033[0;33m'
BLD='\033[1m'
RST='\033[0m'

err()  { echo -e "${RED}ERROR:${RST} $*" >&2; }
info() { echo -e "${BLD}==>${RST} $*"; }
ok()   { echo -e "${GRN}✓${RST} $*"; }
warn() { echo -e "${YEL}WARN:${RST} $*"; }

mask_url() {
  # Replace :password@ with :***@ for safe log output
  echo "${1//:*@/://***@}"
}

# ── 1. Validate argument ──────────────────────────────────────────────────────

ENV="${1:-}"
if [[ "$ENV" != "staging" && "$ENV" != "prod" ]]; then
  echo "Usage: bash scripts/deploy-migration.sh <staging|prod>"
  echo ""
  echo "  staging   Apply to alphavyuh-staging (safe to run anytime)"
  echo "  prod      Apply to production (run after staging is verified)"
  exit 1
fi

START_TIME=$(date +%s)

# ── 2. Load .env.local ────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  err ".env.local not found at $ENV_FILE"
  echo ""
  echo "Create it with the required DB URL variables:"
  echo "  STAGING_SUPABASE_DB_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres"
  echo "  PROD_SUPABASE_DB_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres"
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

# ── 3. Pick DB URL ────────────────────────────────────────────────────────────

if [[ "$ENV" == "staging" ]]; then
  DB_URL="${STAGING_SUPABASE_DB_URL:-}"
  if [[ -z "$DB_URL" ]]; then
    err "STAGING_SUPABASE_DB_URL is not set in .env.local"
    echo "Add: STAGING_SUPABASE_DB_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres"
    exit 1
  fi
else
  DB_URL="${PROD_SUPABASE_DB_URL:-}"
  if [[ -z "$DB_URL" ]]; then
    err "PROD_SUPABASE_DB_URL is not set in .env.local"
    echo "Add: PROD_SUPABASE_DB_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres"
    exit 1
  fi
fi

MASKED_URL="$(mask_url "$DB_URL")"

echo ""
info "deploy-migration.sh"
echo "  Environment : ${BLD}$ENV${RST}"
echo "  Target      : $MASKED_URL"
echo ""

# ── 4. Pre-flight connection test ─────────────────────────────────────────────

PREFLIGHT_OUT="/tmp/migration-preflight-$ENV.txt"
PREFLIGHT_ERR="/tmp/migration-preflight-$ENV.err"

info "Pre-flight connection check..."

cd "$REPO_ROOT"

# One shot — no retries. Retrying on auth failure causes Supabase IP bans.
if ! npx supabase migration list --db-url "$DB_URL" > "$PREFLIGHT_OUT" 2> "$PREFLIGHT_ERR"; then
  STDERR_CONTENT="$(cat "$PREFLIGHT_ERR")"

  if echo "$STDERR_CONTENT" | grep -qi "password authentication failed"; then
    err "Auth failed — check the password in .env.local for ${ENV^^}_SUPABASE_DB_URL"
    echo "  The password is URL-encoded in the connection string."
    echo "  Regenerate from: Supabase dashboard → Settings → Database → Reset database password"
  elif echo "$STDERR_CONTENT" | grep -qi "connection refused"; then
    err "Connection refused — Supabase may have banned this IP after repeated auth failures."
    echo "  Check: Supabase dashboard → Settings → Network Bans"
    echo "  Wait for the ban to lift (usually 60 minutes), or unblock via the dashboard."
  elif echo "$STDERR_CONTENT" | grep -qi "could not translate host name"; then
    err "Bad hostname — check the DB URL in .env.local for ${ENV^^}_SUPABASE_DB_URL"
    echo "  Expected format: postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres"
  elif echo "$STDERR_CONTENT" | grep -qi "timeout\|timed out"; then
    err "Connection timed out — check your network or Supabase status at status.supabase.com"
  else
    err "Pre-flight failed with unexpected error:"
    echo "$STDERR_CONTENT" >&2
  fi
  exit 1
fi

ok "Connection OK"
echo ""

# ── 5. Show pending migrations ────────────────────────────────────────────────

PREFLIGHT_CONTENT="$(cat "$PREFLIGHT_OUT")"

# Count lines that contain "pending" (supabase migration list marks unapplied rows)
PENDING_COUNT=$(echo "$PREFLIGHT_CONTENT" | grep -ic "pending" || true)

if [[ "$PENDING_COUNT" -eq 0 ]]; then
  ok "No pending migrations. Nothing to do."
  exit 0
fi

info "Migration status (${BLD}$PENDING_COUNT pending${RST}):"
echo "$PREFLIGHT_CONTENT"
echo ""

# ── 6. Confirmation prompt ────────────────────────────────────────────────────

if [[ "$ENV" == "prod" ]]; then
  warn "You are about to apply $PENDING_COUNT migration(s) to ${BLD}PRODUCTION${RST}."
  warn "Staging must have been verified before running prod."
  echo ""
  printf "  Type %byes%b to proceed (anything else aborts): " "$BLD" "$RST"
  read -r CONFIRM
  if [[ "$CONFIRM" != "yes" ]]; then
    echo "Aborted."
    exit 0
  fi
else
  printf "  Apply %b%d migration(s)%b to staging? [y/N] " "$BLD" "$PENDING_COUNT" "$RST"
  read -r CONFIRM
  if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "Aborted."
    exit 0
  fi
fi

echo ""

# ── 7. Apply migrations ───────────────────────────────────────────────────────

info "Applying migrations..."
APPLY_OUT="/tmp/migration-apply-$ENV.txt"

if ! npx supabase db push --db-url "$DB_URL" 2>&1 | tee "$APPLY_OUT"; then
  err "Migration apply failed. See output above."
  echo ""
  echo "The migration may be partially applied. Investigate before retrying:"
  echo "  npx supabase migration list --db-url \"\$${ENV^^}_SUPABASE_DB_URL\""
  exit 1
fi

echo ""

# ── 8. Post-apply verification ────────────────────────────────────────────────

info "Verifying post-apply state..."
POST_OUT="/tmp/migration-postapply-$ENV.txt"
POST_ERR="/tmp/migration-postapply-$ENV.err"

if ! npx supabase migration list --db-url "$DB_URL" > "$POST_OUT" 2> "$POST_ERR"; then
  warn "Post-apply verification query failed (migrations may still have applied correctly)."
  cat "$POST_ERR" >&2
else
  POST_CONTENT="$(cat "$POST_OUT")"
  POST_PENDING=$(echo "$POST_CONTENT" | grep -ic "pending" || true)

  echo "$POST_CONTENT"
  echo ""

  if [[ "$POST_PENDING" -gt 0 ]]; then
    warn "$POST_PENDING migration(s) still show as pending after apply."
    warn "Check the output above and investigate before marking this done."
  else
    ok "All migrations applied. No pending migrations remain."
  fi
fi

# ── 9. Summary ────────────────────────────────────────────────────────────────

END_TIME=$(date +%s)
DURATION=$(( END_TIME - START_TIME ))

echo ""
echo "────────────────────────────────────────"
info "Summary"
echo "  Environment  : ${BLD}$ENV${RST}"
echo "  Applied      : ${BLD}$PENDING_COUNT migration(s)${RST}"
echo "  Duration     : ${DURATION}s"
echo ""

if [[ "$ENV" == "prod" ]]; then
  ok "Production migration complete."
  echo ""
  echo "  Next steps:"
  echo "  1. Add the following marker to your PR description:"
  echo "     <!-- migration-applied-to-prod -->"
  echo "  2. Verify in Supabase dashboard → alphavyuh (prod) → Table Editor"
  echo "  3. Confirm the check-migration-drift.yml CI check goes green"
else
  ok "Staging migration complete."
  echo ""
  echo "  Next steps:"
  echo "  1. Verify the result in Supabase dashboard → alphavyuh-staging → Table Editor"
  echo "  2. Run smoke checks against staging"
  echo "  3. When staging is confirmed good, apply to prod:"
  echo "     bash scripts/deploy-migration.sh prod"
fi
echo "────────────────────────────────────────"
echo ""
