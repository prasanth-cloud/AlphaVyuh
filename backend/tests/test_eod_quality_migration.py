from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
MIGRATION = REPO_ROOT / "supabase/migrations/20260820000004_eod_quality_job_runs.sql"


def test_eod_quality_migration_creates_service_only_job_history():
    sql = " ".join(MIGRATION.read_text().lower().split())

    assert "create table if not exists public.job_runs" in sql
    assert "alter table public.job_runs enable row level security" in sql
    assert "revoke all on table public.job_runs from anon, authenticated" in sql
    assert "grant all on table public.job_runs to service_role" in sql
    assert "status in ('running', 'success', 'partial', 'failed', 'skipped')" in sql


def test_eod_quality_migration_adds_explicit_bhavcopy_counters():
    sql = " ".join(MIGRATION.read_text().lower().split())

    for column in (
        "job_run_id",
        "quality_status",
        "source_rows",
        "accepted_rows",
        "filtered_series_rows",
        "missing_required_rows",
        "invalid_ohlcv_rows",
        "duplicate_rows",
        "quality_summary",
    ):
        assert f"add column if not exists {column}" in sql

    assert "references public.job_runs(id) on delete set null" in sql
