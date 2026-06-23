from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "20260605124635_harden_security_rls_boundaries.sql"


def _sql() -> str:
    return " ".join(MIGRATION.read_text().lower().split())


def test_users_table_is_read_only_for_direct_authenticated_clients():
    sql = _sql()

    assert 'drop policy if exists "users can update own profile" on public.users' in sql
    assert "revoke all on table public.users from anon, authenticated" in sql
    assert "grant select on table public.users to authenticated" in sql
    assert "grant select, insert, update, delete on table public.users to service_role" in sql
    assert 'create policy "users can read own profile" on public.users for select to authenticated' in sql
    assert "auth.uid() is not null and auth.uid() = id" in sql


def test_order_idempotency_is_service_role_owned():
    sql = _sql()

    assert 'drop policy if exists "users can read own idempotency rows" on public.order_idempotency' in sql
    assert 'drop policy if exists "users can insert own idempotency rows" on public.order_idempotency' in sql
    assert 'drop policy if exists "users can update own idempotency rows" on public.order_idempotency' in sql
    assert "revoke all on table public.order_idempotency from anon, authenticated" in sql
    assert "grant select, insert, update, delete on table public.order_idempotency to service_role" in sql


def test_scan_alert_match_policy_requires_owned_parent_alert():
    sql = _sql()

    assert 'drop policy if exists "users manage own scan_alert_matches" on public.scan_alert_matches' in sql
    assert 'create policy "users manage own scan_alert_matches" on public.scan_alert_matches for all' in sql
    assert "auth.uid() = user_id and exists" in sql
    assert "from public.scan_alerts a where a.id = scan_alert_matches.alert_id and a.user_id = auth.uid()" in sql
    assert sql.count("from public.scan_alerts a where a.id = scan_alert_matches.alert_id") == 2
