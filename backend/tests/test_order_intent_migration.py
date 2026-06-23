from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
MIGRATION = (
    REPO_ROOT
    / "supabase"
    / "migrations"
    / "20260619004532_atomic_order_intent_reservation.sql"
)


def test_order_intent_migration_enforces_atomic_uniqueness() -> None:
    sql = MIGRATION.read_text().lower()

    assert "add column if not exists order_intent_key uuid" in sql
    assert "trade_journal_user_order_intent_unique" in sql
    assert "on public.trade_journal (user_id, order_intent_key)" in sql
    assert "broker_orders_user_order_intent_unique" in sql
    assert "on public.broker_orders (user_id, idempotency_key)" in sql
    assert sql.count("having count(*) > 1") == 2


def test_canonical_broker_orders_table_has_rls_and_owner_policy() -> None:
    sql = MIGRATION.read_text().lower()

    assert "create table if not exists public.broker_orders" in sql
    assert "alter table public.broker_orders enable row level security" in sql
    assert "create policy broker_orders_owner" in sql
    assert "to authenticated" in sql
    assert "using ((select auth.uid()) = user_id)" in sql
    assert "with check ((select auth.uid()) = user_id)" in sql
