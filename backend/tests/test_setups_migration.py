from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
MIGRATION = REPO_ROOT / "supabase" / "migrations" / "20260820000000_setups_foundation.sql"
BROKER_CONNECTION_MIGRATION = REPO_ROOT / "supabase" / "migrations" / "20260820000001_lock_broker_connection_smoke_state.sql"


def test_setup_migration_creates_owner_scoped_foundation() -> None:
    sql = " ".join(MIGRATION.read_text().lower().split())

    assert "create table if not exists public.setups" in sql
    assert "user_id uuid not null references auth.users(id)" in sql
    assert "alter table public.setups enable row level security" in sql
    assert "create policy setups_owner" in sql
    assert "using ((select auth.uid()) = user_id)" in sql
    assert "with check ((select auth.uid()) = user_id)" in sql
    assert "setups_user_symbol_status_idx" in sql


def test_setup_migration_links_existing_workflow_and_trade_records() -> None:
    sql = " ".join(MIGRATION.read_text().lower().split())

    assert "add constraint setups_user_id_id_key unique (user_id, id)" in sql
    assert "workflow_states_user_setup_fkey foreign key (user_id, setup_id) references public.setups (user_id, id) on delete set null (setup_id)" in sql
    assert "trade_journal_user_setup_fkey foreign key (user_id, setup_id) references public.setups (user_id, id) on delete set null (setup_id)" in sql
    assert "broker_orders_user_setup_fkey foreign key (user_id, setup_id) references public.setups (user_id, id) on delete set null (setup_id)" in sql
    assert "workflow_states_user_setup_idx" in sql
    assert "trade_journal_user_setup_idx" in sql
    assert "broker_orders_user_setup_idx" in sql


def test_setup_migration_can_point_back_to_a_scanner_candidate() -> None:
    lineage_migration = REPO_ROOT / "supabase/migrations/20260820000003_scanner_lineage.sql"
    sql = " ".join(lineage_migration.read_text().lower().split())

    assert "alter table public.setups add column if not exists source_scanner_candidate_id uuid" in sql
    assert "setups_source_scanner_candidate_idx" in sql
    assert "foreign key (user_id, source_scanner_candidate_id) references public.scanner_candidates (user_id, id)" in sql


def test_broker_smoke_state_migration_removes_authenticated_write_access() -> None:
    sql = " ".join(BROKER_CONNECTION_MIGRATION.read_text().lower().split())

    assert "drop policy if exists broker_connections_owner" in sql
    assert "create policy broker_connections_read_own" in sql
    assert "for select" in sql
    assert "revoke insert, update, delete on table public.broker_connections from anon, authenticated" in sql
