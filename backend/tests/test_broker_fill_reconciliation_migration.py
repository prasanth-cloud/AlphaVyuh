from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
MIGRATION = REPO_ROOT / "supabase/migrations/20260821000000_broker_fill_reconciliation.sql"


def test_broker_fill_reconciliation_migration_is_owner_scoped_and_service_owned() -> None:
    sql = MIGRATION.read_text()

    assert "create table if not exists public.broker_fill_reconciliations" in sql
    assert "alter table public.broker_fill_reconciliations enable row level security" in sql
    assert "create policy broker_fill_reconciliations_owner_read" in sql
    assert "using ((select auth.uid()) = user_id)" in sql
    assert "revoke all on table public.broker_fill_reconciliations from anon" in sql
    assert "revoke insert, update, delete on table public.broker_fill_reconciliations from authenticated" in sql
    assert "grant select on table public.broker_fill_reconciliations to authenticated" in sql
    assert "broker_fill_reconciliations_identity_idx" in sql
    assert "(user_id, broker, broker_order_id)" in sql


def test_broker_fill_reconciliation_migration_keeps_broker_payloads_out() -> None:
    sql = MIGRATION.read_text().lower()

    assert "raw_response" not in sql
    assert "access_token" not in sql
    assert "api_secret" not in sql
    assert "resolution_note" in sql
    assert "char_length(resolution_note) <= 500" in sql
