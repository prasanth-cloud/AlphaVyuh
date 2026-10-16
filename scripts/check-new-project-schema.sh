#!/usr/bin/env bash
# Bootstrap only a new, empty Supabase database; verify existing schemas without
# persisting test data. Connections use libpq PG* variables, never printed URLs.
set -euo pipefail

MODE="${1:---plan}"
case "$MODE" in
  --plan|--bootstrap-sql|--bootstrap-empty|--verify) ;;
  *) echo "Usage: bash scripts/check-new-project-schema.sh [--plan|--bootstrap-sql|--bootstrap-empty|--verify]" >&2; exit 2 ;;
esac
if [[ $# -gt 1 ]]; then
  echo "Only one mode argument is accepted." >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
command -v python3 >/dev/null || { echo "python3 is required." >&2; exit 1; }

if [[ "$MODE" == "--bootstrap-empty" || "$MODE" == "--verify" ]]; then
  command -v psql >/dev/null || { echo "psql is required." >&2; exit 1; }
  if [[ -z "${PGSERVICE:-}" && ( -z "${PGHOST:-}" || -z "${PGDATABASE:-}" ) ]]; then
    echo "Set PGSERVICE or both PGHOST and PGDATABASE for the intended database." >&2
    exit 1
  fi
fi

generate_sql() {
  python3 - "$REPO_ROOT" "$MODE" <<'PY'
import hashlib
import json
from pathlib import Path
import re
import sys

root = Path(sys.argv[1])
mode = sys.argv[2]
bootstrap = mode in {"--bootstrap-empty", "--bootstrap-sql"}
manifest = json.loads((root / "supabase/bootstrap-order.json").read_text())
if manifest.get("version") != 1:
    raise SystemExit("Unsupported bootstrap manifest version")
files = sorted((root / "supabase/migrations").glob("*.sql"))
names = {path.name: path for path in files}
for source, target in manifest["move_before"].items():
    if source not in names or target not in names or source == target:
        raise SystemExit("Invalid migration dependency in bootstrap manifest")
    files.remove(names[source])
    files.insert(files.index(names[target]), names[source])

versions = set()
for path in files:
    match = re.fullmatch(r"(\d+)_(.+)\.sql", path.name)
    if not match or match[1] in versions:
        raise SystemExit("Invalid or duplicate migration version")
    versions.add(match[1])

if mode == "--plan":
    for index, path in enumerate(files, 1):
        print(f"{index:02d} {path.name} sha256={hashlib.sha256(path.read_bytes()).hexdigest()}")
    raise SystemExit(0)

sql = ["BEGIN; SET LOCAL client_min_messages = warning; SET LOCAL lock_timeout = '5s';"]
if bootstrap:
    sql.append("""
select pg_advisory_xact_lock(hashtext('alphavyuh-empty-schema-bootstrap'));
do $$
declare
  existing_history boolean;
begin
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S', 'c')
      and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass
        and d.objid = c.oid and d.deptype = 'e')
  ) or exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and not exists (
      select 1 from pg_depend d where d.classid = 'pg_proc'::regclass
        and d.objid = p.oid and d.deptype = 'e'
    )
    -- Supabase's automatic-RLS option installs this setup function before any
    -- application objects exist. Do not exempt arbitrary public functions.
    and not (
      p.proname = 'rls_auto_enable' and p.pronargs = 0
      and p.prorettype = 'event_trigger'::regtype and p.prosecdef
      and coalesce(p.proconfig @> array['search_path=pg_catalog']::text[], false)
      and exists (select 1 from pg_event_trigger e where e.evtfoid = p.oid
        and e.evtevent = 'ddl_command_end' and e.evtenabled = 'O')
    )
  ) or exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typtype in ('e', 'd') and not exists (
      select 1 from pg_depend d where d.classid = 'pg_type'::regclass
        and d.objid = t.oid and d.deptype = 'e'
    )
  ) then
    raise exception 'Refusing bootstrap: public schema contains application objects';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute 'select exists (select 1 from supabase_migrations.schema_migrations)' into existing_history;
    if existing_history then
      raise exception 'Refusing bootstrap: migration history is not empty';
    end if;
  end if;
  if to_regclass('auth.users') is null or to_regprocedure('auth.uid()') is null then
    raise exception 'Supabase Auth schema/functions must already exist';
  end if;
  if exists (select 1 from auth.users) then
    raise exception 'Refusing bootstrap: Auth users already exist';
  end if;
  if (select count(*) from pg_roles where rolname in ('anon','authenticated','service_role')) <> 3 then
    raise exception 'Supabase database roles must already exist';
  end if;
end $$;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
set local search_path = public, extensions;
grant usage on schema extensions to anon, authenticated, service_role;
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);
revoke all on table supabase_migrations.schema_migrations from public, anon, authenticated;
""")
    for path in files:
        content = path.read_text()
        if re.search(r"^\s*(COMMIT|ROLLBACK|START\s+TRANSACTION)\s*;", content, re.I | re.M):
            raise SystemExit("Migration contains a transaction boundary; review bootstrap before running")
        if any(line.lstrip().startswith("\\") for line in content.splitlines()):
            raise SystemExit("Migration contains psql commands; review bootstrap before running")
        sql.append(f"\n-- Canonical migration: {path.name}\n{content}\n")

sql.append("SAVEPOINT alphavyuh_rls_fixture;")
sql.append((root / "supabase/tests/data-boundaries.sql").read_text())
sql.append("ROLLBACK TO SAVEPOINT alphavyuh_rls_fixture;")

if bootstrap:
    for path in files:
        version, name = path.stem.split("_", 1)
        content = path.read_text()
        tag = "$migration_" + hashlib.sha256(content.encode()).hexdigest()[:16] + "$"
        if tag in content:
            raise SystemExit("Unexpected SQL delimiter collision")
        sql.append(
            "INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES "
            f"('{version}', '{name.replace(chr(39), chr(39)*2)}', ARRAY[{tag}{content}{tag}]);"
        )
    sql.append("NOTIFY pgrst, 'reload schema'; COMMIT;")
else:
    sql.append("ROLLBACK;")
print("\n".join(sql))
PY
}

if [[ "$MODE" == "--plan" || "$MODE" == "--bootstrap-sql" ]]; then
  generate_sql
else
  generate_sql | psql -X --no-password --set=ON_ERROR_STOP=1 --quiet >/dev/null
  if [[ "$MODE" == "--bootstrap-empty" ]]; then
    echo "Empty-project bootstrap and rollback-only RLS checks passed; canonical migration history committed."
  else
    echo "RLS checks passed; all synthetic test data rolled back."
  fi
fi
