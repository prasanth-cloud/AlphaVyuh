from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "20260603150900_payment_activation_idempotency.sql"


def _normalized_sql() -> str:
    return " ".join(MIGRATION.read_text().lower().split())


def test_payment_logs_have_unique_razorpay_payment_id_before_activation():
    sql = _normalized_sql()

    assert "create table if not exists public.payment_logs" in sql
    assert "create unique index if not exists idx_payment_logs_razorpay_payment_id on public.payment_logs (razorpay_payment_id) where razorpay_payment_id not like 'access-%'" in sql
    assert "insert into public.payment_logs" in sql
    assert "update public.users" in sql
    assert sql.index("insert into public.payment_logs") < sql.index("update public.users")


def test_payment_activation_rpc_returns_replay_without_extending_plan():
    sql = _normalized_sql()

    assert "create or replace function public.activate_razorpay_payment" in sql
    assert "where razorpay_payment_id = p_razorpay_payment_id" in sql
    assert "existing_payment.plan_expires_at" in sql
    assert "true" in sql
    assert "revoke execute on function public.activate_razorpay_payment" in sql
    assert "grant execute on function public.activate_razorpay_payment" in sql
