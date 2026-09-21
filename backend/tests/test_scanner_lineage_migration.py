from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
MIGRATION = REPO_ROOT / "supabase/migrations/20260820000003_scanner_lineage.sql"


def test_scanner_lineage_migration_creates_the_user_owned_entities() -> None:
    sql = " ".join(MIGRATION.read_text().lower().split())

    for table in (
        "scanner_definitions",
        "scanner_filter_groups",
        "scanner_filters",
        "scanner_runs",
        "scanner_candidates",
    ):
        assert f"create table if not exists public.{table}" in sql
        assert f"alter table public.{table} enable row level security" in sql
        assert f"create policy {table}_owner" in sql

    assert "foreign key (user_id, scanner_run_id) references public.scanner_runs (user_id, id)" in sql
    assert "foreign key (user_id, setup_id) references public.setups (user_id, id)" in sql
    assert "add column if not exists source_scanner_candidate_id uuid" in sql
    assert "foreign key (user_id, source_scanner_candidate_id)" in sql
    assert "on delete set null (source_scanner_candidate_id)" in sql


def test_scanner_lineage_migration_preserves_run_and_candidate_explainability() -> None:
    sql = " ".join(MIGRATION.read_text().lower().split())

    assert "input_definition jsonb not null" in sql
    assert "matched_conditions jsonb not null" in sql
    assert "result_snapshot jsonb not null" in sql
    assert "unique (user_id, scanner_run_id, symbol)" in sql
    assert "scanner_candidates_run_rank_idx" in sql
