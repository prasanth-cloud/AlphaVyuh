from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
MIGRATION = (
    REPO_ROOT
    / "supabase"
    / "migrations"
    / "20260618030712_enable_symbol_aliases_rls.sql"
)


def test_symbol_aliases_public_read_is_guarded_by_rls() -> None:
    sql = MIGRATION.read_text().lower()

    assert "alter table public.symbol_aliases enable row level security" in sql
    assert 'create policy "public read symbol aliases"' in sql
    assert "for select" in sql
    assert "to anon, authenticated" in sql
    assert "using (true)" in sql
