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
    assert "with duplicate_payments as" in sql
    assert "row_number() over ( partition by razorpay_payment_id order by created_at desc nulls last, id desc ) as duplicate_rank" in sql
    assert "set razorpay_payment_id = p.razorpay_payment_id || '-legacy-' || p.id::text" in sql
    assert sql.index("with duplicate_payments as") < sql.index("create unique index if not exists idx_payment_logs_razorpay_payment_id")
    assert sql.index("insert into public.payment_logs") < sql.index("update public.users")


def test_payment_logs_migration_normalizes_existing_rows_before_not_null():
    sql = _normalized_sql()

    assert "update public.payment_logs set razorpay_order_id = coalesce(nullif(razorpay_order_id, ''), 'legacy-' || id::text)" in sql
    assert "razorpay_payment_id = coalesce(nullif(razorpay_payment_id, ''), 'legacy-' || id::text)" in sql
    assert "plan = case when plan in ('pro', 'elite') then plan else 'pro' end" in sql
    assert "amount = case when amount is null or amount < 0 then 0 else amount end" in sql
    assert "currency = case when currency in ('inr', 'usd') then currency else 'inr' end" in sql
    assert sql.index("update public.payment_logs set") < sql.index("alter column razorpay_payment_id set not null")


def test_payment_logs_migration_adds_constraints_for_existing_tables():
    sql = _normalized_sql()

    assert "add column if not exists created_at timestamptz not null default now()" in sql
    for constraint_name in (
        "payment_logs_plan_check",
        "payment_logs_amount_check",
        "payment_logs_currency_check",
        "payment_logs_billing_check",
    ):
        assert f"and conname = '{constraint_name}'" in sql
        assert f"validate constraint {constraint_name}" in sql


def test_payment_activation_rpc_returns_replay_without_extending_plan():
    sql = _normalized_sql()

    assert "create or replace function public.activate_razorpay_payment" in sql
    assert "where razorpay_payment_id = p_razorpay_payment_id" in sql
    assert "existing_payment.plan_expires_at" in sql
    assert "true" in sql
    assert "revoke execute on function public.activate_razorpay_payment" in sql
    assert "grant execute on function public.activate_razorpay_payment" in sql
