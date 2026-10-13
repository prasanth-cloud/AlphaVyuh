#!/usr/bin/env bash
# Exercise bootstrap and rollback safety in a disposable socket-only cluster.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
for tool in initdb pg_ctl psql python3 rg; do
  command -v "$tool" >/dev/null || { echo "$tool is required." >&2; exit 1; }
done

AUDIT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/av-schema.XXXXXX")"
cleanup() {
  pg_ctl -D "$AUDIT_DIR/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$AUDIT_DIR"
}
trap cleanup EXIT
if [[ ${#AUDIT_DIR} -gt 90 ]]; then
  echo "TMPDIR is too long for a PostgreSQL Unix socket; use a shorter directory." >&2
  exit 1
fi
initdb -D "$AUDIT_DIR/data" --auth=trust --no-locale >"$AUDIT_DIR/initdb.log"
pg_ctl -D "$AUDIT_DIR/data" -l "$AUDIT_DIR/postgres.log" \
  -o "-c listen_addresses='' -k '$AUDIT_DIR' -p 58439" start >/dev/null
export PGHOST="$AUDIT_DIR" PGPORT=58439 PGDATABASE=postgres
export PGUSER="$(id -un)"
unset PGSERVICE PGSERVICEFILE PGOPTIONS PGPASSWORD PGHOSTADDR

new_database() {
  PGDATABASE=postgres psql -X -v ON_ERROR_STOP=1 -q -c "create database $1"
  export PGDATABASE="$1"
  psql -X -v ON_ERROR_STOP=1 -q -f "$REPO_ROOT/supabase/tests/local-auth-fixture.sql"
}

expect_failure() {
  local expected="$1"
  shift
  if "$@" >"$AUDIT_DIR/expected-failure.log" 2>&1; then
    echo "Expected failure did not occur: $expected" >&2
    exit 1
  fi
  if ! rg -F "$expected" "$AUDIT_DIR/expected-failure.log" >/dev/null; then
    cat "$AUDIT_DIR/expected-failure.log" >&2
    echo "Unexpected failure; expected: $expected" >&2
    exit 1
  fi
}

new_database bootstrap_canonical_order
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
create schema extensions;
create extension pgcrypto with schema extensions;
SQL
python3 - "$REPO_ROOT" >"$AUDIT_DIR/canonical-order.sql" <<'PY'
from pathlib import Path
import sys
print("BEGIN; SET LOCAL client_min_messages = warning; SET LOCAL search_path = public, extensions;")
for path in sorted((Path(sys.argv[1]) / "supabase/migrations").glob("*.sql")):
    print(path.read_text())
print("COMMIT;")
PY
expect_failure 'relation "public.workflow_states" does not exist' \
  psql -X -v ON_ERROR_STOP=1 -q -f "$AUDIT_DIR/canonical-order.sql"

new_database bootstrap_default_grants
bash "$REPO_ROOT/scripts/check-new-project-schema.sh" --bootstrap-sql >"$AUDIT_DIR/bootstrap.sql"
psql -X --no-password -v ON_ERROR_STOP=1 -q -f "$AUDIT_DIR/bootstrap.sql" >/dev/null
bash "$REPO_ROOT/scripts/check-new-project-schema.sh" --verify
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
do $$ begin
  if (select count(*) from auth.users) <> 0 then
    raise exception 'Synthetic auth users were not rolled back';
  end if;
  if (select count(*) from public.daily_ohlcv) <> 0 then
    raise exception 'Bootstrap must not fabricate market candles';
  end if;
end $$;
SQL
expected_count="$(bash "$REPO_ROOT/scripts/check-new-project-schema.sh" --plan | wc -l | tr -d ' ')"
actual_count="$(psql -X -Atc 'select count(*) from supabase_migrations.schema_migrations')"
[[ "$actual_count" == "$expected_count" ]] || { echo "Migration history count mismatch." >&2; exit 1; }
expect_failure "public schema contains application objects" \
  bash "$REPO_ROOT/scripts/check-new-project-schema.sh" --bootstrap-empty

new_database bootstrap_no_default_grants
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
alter default privileges in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges in schema public revoke all on sequences from anon, authenticated, service_role;
alter default privileges in schema public revoke execute on functions from anon, authenticated, service_role;
SQL
bash "$REPO_ROOT/scripts/check-new-project-schema.sh" --bootstrap-empty

new_database bootstrap_auto_rls
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
create function public.rls_auto_enable() returns event_trigger
language plpgsql security definer set search_path = pg_catalog as $$
declare cmd record;
begin
  for cmd in select * from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table','partitioned table')
  loop
    if cmd.schema_name = 'public' then
      execute format('alter table %s enable row level security', cmd.object_identity);
    end if;
  end loop;
end $$;
create event trigger rls_auto_enable on ddl_command_end execute function public.rls_auto_enable();
SQL
bash "$REPO_ROOT/scripts/check-new-project-schema.sh" --bootstrap-empty
bash "$REPO_ROOT/scripts/check-new-project-schema.sh" --verify

new_database bootstrap_unattached_setup_function
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
create function public.rls_auto_enable() returns event_trigger
language plpgsql security definer set search_path = pg_catalog as $$ begin return; end $$;
SQL
expect_failure "public schema contains application objects" \
  bash "$REPO_ROOT/scripts/check-new-project-schema.sh" --bootstrap-empty

new_database bootstrap_unsafe_setup_function
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
create function public.rls_auto_enable() returns event_trigger
language plpgsql security definer as $$ begin return; end $$;
create event trigger rls_auto_enable on ddl_command_end execute function public.rls_auto_enable();
SQL
expect_failure "public schema contains application objects" \
  bash "$REPO_ROOT/scripts/check-new-project-schema.sh" --bootstrap-empty

new_database bootstrap_failure_rollback
mkdir -p "$AUDIT_DIR/failure-repo/scripts" "$AUDIT_DIR/failure-repo/supabase"
cp "$REPO_ROOT/scripts/check-new-project-schema.sh" "$AUDIT_DIR/failure-repo/scripts/"
cp -R "$REPO_ROOT/supabase/migrations" "$REPO_ROOT/supabase/tests" "$AUDIT_DIR/failure-repo/supabase/"
cp "$REPO_ROOT/supabase/bootstrap-order.json" "$AUDIT_DIR/failure-repo/supabase/"
# Synthetic fault injection, never a canonical migration or a hosted operation.
echo 'select 1 / 0;' >"$AUDIT_DIR/failure-repo/supabase/migrations/99999999999999_failure_fixture.sql"
expect_failure "division by zero" bash "$AUDIT_DIR/failure-repo/scripts/check-new-project-schema.sh" --bootstrap-empty
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
do $$ begin
  if to_regclass('public.users') is not null
    or to_regclass('supabase_migrations.schema_migrations') is not null then
    raise exception 'Failed bootstrap left schema or fake migration history behind';
  end if;
end $$;
SQL

new_database bootstrap_existing_auth
psql -X -v ON_ERROR_STOP=1 -q -c "insert into auth.users(id,email) values (gen_random_uuid(),'existing@example.invalid')"
expect_failure "Auth users already exist" bash "$REPO_ROOT/scripts/check-new-project-schema.sh" --bootstrap-empty
echo "PASS: default grants, explicit grants, anon/two-user/service RLS, empty guards, and atomic rollback."
