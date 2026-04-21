#!/usr/bin/env bash
# Push all pending migrations to the staging Supabase project.
# Reads STAGING_SUPABASE_DB_URL from .env.local in the repo root.
#
# Usage: bun run db:push:staging
# Requires: STAGING_SUPABASE_DB_URL set in .env.local
#
# STAGING_SUPABASE_DB_URL format (from Supabase dashboard
#   → Settings → Database → Connection string → URI):
#   postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.local"

# Load STAGING_SUPABASE_DB_URL from .env.local if it exists
if [[ -f "$ENV_FILE" ]]; then
  export $(grep -E '^STAGING_SUPABASE_DB_URL=' "$ENV_FILE" | xargs) 2>/dev/null || true
fi

if [[ -z "${STAGING_SUPABASE_DB_URL:-}" ]]; then
  echo "ERROR: STAGING_SUPABASE_DB_URL is not set."
  echo ""
  echo "Add it to .env.local in the repo root:"
  echo "  STAGING_SUPABASE_DB_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres"
  echo ""
  echo "(Get this from: Supabase dashboard → alphavyuh-staging → Settings → Database → Connection string → URI)"
  exit 1
fi

echo "==> Pushing migrations to staging..."
echo "    Target: ${STAGING_SUPABASE_DB_URL//:*@/://***@}"   # mask password in output
echo ""

cd "$REPO_ROOT"
npx supabase db push --db-url "$STAGING_SUPABASE_DB_URL"

echo ""
echo "==> Done. Verify in Supabase dashboard: alphavyuh-staging → Table Editor"
