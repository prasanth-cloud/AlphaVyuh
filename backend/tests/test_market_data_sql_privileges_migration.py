from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "20260603140700_lock_down_market_data_privileges.sql"


def _normalized_sql() -> str:
    return " ".join(MIGRATION.read_text().lower().split())


def test_market_data_tables_are_read_only_for_public_roles():
    sql = _normalized_sql()

    for table_name in (
        "stock_universe",
        "daily_ohlcv",
        "weekly_ohlcv",
        "corporate_actions",
    ):
        assert table_name in sql

    assert "revoke insert, update, delete, truncate, references, trigger on table public.%i from anon, authenticated" in sql
    assert "grant select on table public.%i to anon, authenticated" in sql
    assert "grant all on table public.%i to service_role" in sql


def test_operational_market_data_logs_are_service_role_only():
    sql = _normalized_sql()

    for table_name in ("ingest_runs", "bhavcopy_ingestion_log"):
        assert table_name in sql
    assert "revoke all on table public.%i from anon, authenticated" in sql
    assert "grant all on table public.%i to service_role" in sql
    assert "grant all on table public.data_health to service_role" in sql
    assert "grant select on table public.data_health to anon" not in sql


def test_mutating_rs_score_rpc_is_service_role_only():
    sql = _normalized_sql()

    assert "create or replace function public.compute_rs_score_for_date(p_trade_date date)" in sql
    assert "security definer set search_path = public" in sql
    assert "update daily_ohlcv d set rs_score = r.rs_score" in sql
    assert "revoke execute on function public.compute_rs_score_for_date(date) from public, anon, authenticated" in sql
    assert "grant execute on function public.compute_rs_score_for_date(date) to service_role" in sql


def test_market_data_definer_rpcs_are_not_publicly_executable():
    sql = _normalized_sql()

    for signature in (
        "public.resolve_market_symbol(text)",
        "public.get_adjusted_candles(text, date, date, int, boolean)",
        "public.market_data_coverage_audit(int)",
        "public.get_vcp_lookback(text[], date, int)",
    ):
        assert f"revoke execute on function {signature} from public, anon, authenticated" in sql
        assert f"grant execute on function {signature} to service_role" in sql
