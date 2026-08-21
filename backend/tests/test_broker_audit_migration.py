from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
MIGRATION = REPO_ROOT / "supabase/migrations/20260820000007_broker_audit_events.sql"


def test_broker_audit_migration_is_owner_scoped_and_append_only_by_api_privilege() -> None:
    sql = MIGRATION.read_text()

    assert "create table if not exists public.audit_logs" in sql
    assert "alter table public.audit_logs enable row level security" in sql
    assert "create policy audit_logs_owner_read" in sql
    assert "using ((select auth.uid()) = user_id)" in sql
    assert "revoke all on table public.audit_logs from anon" in sql
    assert "revoke insert, update, delete on table public.audit_logs from authenticated" in sql
    assert "grant select on table public.audit_logs to authenticated" in sql
    assert "foreign key (user_id, setup_id)" in sql
    assert "foreign key (user_id, journal_id)" in sql
    assert "on delete set null (setup_id)" in sql
    assert "on delete set null (journal_id)" in sql


def test_broker_audit_migration_forbids_secret_and_raw_response_columns() -> None:
    sql = MIGRATION.read_text().lower()

    assert "access_token" not in sql
    assert "raw_response" not in sql
    assert "never store credentials" in sql
