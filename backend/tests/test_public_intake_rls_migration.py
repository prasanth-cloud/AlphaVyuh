from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "20260517123000_public_intake_feedback_rls.sql"


def _normalized_sql() -> str:
    return " ".join(MIGRATION.read_text().lower().split())


def test_public_intake_feedback_tables_enable_rls():
    sql = _normalized_sql()

    for table in ("waitlist", "invite_codes", "feedback_reports"):
        assert f"alter table if exists public.{table} enable row level security" in sql


def test_public_intake_feedback_tables_revoke_direct_client_roles():
    sql = _normalized_sql()

    for table in ("waitlist", "invite_codes", "feedback_reports"):
        assert f"revoke all on table public.{table} from anon, authenticated" in sql


def test_public_intake_feedback_tables_preserve_service_role_access():
    sql = _normalized_sql()

    for table in ("waitlist", "invite_codes", "feedback_reports"):
        assert f"grant all on table public.{table} to service_role" in sql
