from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def test_unplanned_journal_migration_backfills_only_rows_without_setups():
    sql = (REPO_ROOT / "supabase/migrations/20260820000005_unplanned_journal_tag.sql").read_text()

    assert "set setup_type = 'unplanned'" in sql
    assert "where setup_id is null" in sql
    assert "btrim(setup_type) = ''" in sql
