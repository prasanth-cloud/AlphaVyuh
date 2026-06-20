from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "20260603130600_lock_down_users_profile_updates.sql"


def _normalized_sql() -> str:
    return " ".join(MIGRATION.read_text().lower().split())


def test_users_profile_migration_removes_direct_client_updates():
    sql = _normalized_sql()

    assert 'drop policy if exists "users can update own profile" on public.users' in sql
    assert "revoke all on table public.users from anon, authenticated" in sql
    assert "grant select on table public.users to authenticated" in sql
    assert "grant all on table public.users to service_role" in sql


def test_users_profile_read_policy_stays_user_scoped():
    sql = _normalized_sql()

    assert "create policy \"users can read own profile\" on public.users for select to authenticated" in sql
    assert "auth.uid() is not null and auth.uid() = id" in sql
