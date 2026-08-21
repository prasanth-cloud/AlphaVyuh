from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
MIGRATION = REPO_ROOT / "supabase/migrations/20260821000001_intraday_trade_paths.sql"


def _sql() -> str:
    return " ".join(MIGRATION.read_text().lower().split())


def test_intraday_paths_are_owner_scoped_and_backend_written():
    sql = _sql()

    assert "create table if not exists public.trade_intraday_paths" in sql
    assert "user_id uuid not null references public.users(id) on delete cascade" in sql
    assert "foreign key (user_id, journal_id) references public.trade_journal (user_id, id)" in sql
    assert "unique (user_id, journal_id, broker, interval, from_at, to_at)" in sql
    assert "alter table public.trade_intraday_paths enable row level security" in sql
    assert "create policy trade_intraday_paths_owner_read" in sql
    assert "using ((select auth.uid()) = user_id)" in sql
    assert "revoke all on table public.trade_intraday_paths from anon" in sql
    assert "revoke insert, update, delete on table public.trade_intraday_paths from authenticated" in sql
    assert "grant select on table public.trade_intraday_paths to authenticated" in sql


def test_intraday_path_payload_is_normalized_and_bounded():
    sql = _sql()

    assert "check (jsonb_typeof(bars) = 'array')" in sql
    assert "check (bar_count >= 0 and bar_count <= 20000)" in sql
    assert "check (bar_count = jsonb_array_length(bars))" in sql
    assert "source in ('zerodha_kite')" in sql
    assert "never store broker credentials or raw provider responses" in sql
