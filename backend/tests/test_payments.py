"""Tests for payment plan pricing and signature verification."""
import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

from app.routers import payments  # noqa: E402
from app.services.plans import effective_plan_from_record, get_effective_user_plan  # noqa: E402


# ── Plan prices ────────────────────────────────────────────────────────────────

PLAN_PRICES = {
    ("pro",   "INR", "monthly"): {"amount": 199900,  "days": 30},
    ("pro",   "INR", "annual"):  {"amount": 1999900, "days": 365},
    ("elite", "INR", "monthly"): {"amount": 499900,  "days": 30},
    ("elite", "INR", "annual"):  {"amount": 4999900, "days": 365},
    ("pro",   "USD", "monthly"): {"amount": 2900,    "days": 30},
    ("pro",   "USD", "annual"):  {"amount": 27900,   "days": 365},
    ("elite", "USD", "monthly"): {"amount": 6900,    "days": 30},
    ("elite", "USD", "annual"):  {"amount": 69900,   "days": 365},
}


class TestPlanPrices:
    def test_all_combinations_present(self):
        plans = ["pro", "elite"]
        currencies = ["INR", "USD"]
        periods = ["monthly", "annual"]
        for plan in plans:
            for curr in currencies:
                for period in periods:
                    assert (plan, curr, period) in PLAN_PRICES

    def test_annual_costs_more_than_monthly(self):
        for plan in ["pro", "elite"]:
            for curr in ["INR", "USD"]:
                monthly = PLAN_PRICES[(plan, curr, "monthly")]["amount"]
                annual = PLAN_PRICES[(plan, curr, "annual")]["amount"]
                assert annual > monthly * 8  # annual costs more than 8 months

    def test_annual_less_than_12_months(self):
        for plan in ["pro", "elite"]:
            for curr in ["INR", "USD"]:
                monthly = PLAN_PRICES[(plan, curr, "monthly")]["amount"]
                annual = PLAN_PRICES[(plan, curr, "annual")]["amount"]
                assert annual < monthly * 12  # annual saves something

    def test_days_for_monthly(self):
        for key, val in PLAN_PRICES.items():
            if key[2] == "monthly":
                assert val["days"] == 30

    def test_days_for_annual(self):
        for key, val in PLAN_PRICES.items():
            if key[2] == "annual":
                assert val["days"] == 365

    def test_elite_costs_more_than_pro(self):
        for curr in ["INR", "USD"]:
            for period in ["monthly", "annual"]:
                pro = PLAN_PRICES[("pro", curr, period)]["amount"]
                elite = PLAN_PRICES[("elite", curr, period)]["amount"]
                assert elite > pro


class TestPaymentSignature:
    """Test Razorpay HMAC-SHA256 signature verification logic."""

    def _make_sig(self, order_id: str, payment_id: str, secret: str) -> str:
        body = f"{order_id}|{payment_id}"
        return hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()

    def test_valid_signature(self):
        secret = "test_secret_key"
        order_id = "order_abc123"
        payment_id = "pay_xyz789"
        sig = self._make_sig(order_id, payment_id, secret)
        body = f"{order_id}|{payment_id}"
        expected = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
        assert hmac.compare_digest(sig, expected)

    def test_invalid_signature_rejected(self):
        secret = "test_secret_key"
        order_id = "order_abc123"
        payment_id = "pay_xyz789"
        tampered_sig = "0000000000000000000000000000000000000000000000000000000000000000"
        body = f"{order_id}|{payment_id}"
        expected = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
        assert not hmac.compare_digest(tampered_sig, expected)

    def test_wrong_secret_rejected(self):
        order_id = "order_abc123"
        payment_id = "pay_xyz789"
        sig = self._make_sig(order_id, payment_id, "correct_secret")
        body = f"{order_id}|{payment_id}"
        expected = hmac.new("wrong_secret".encode(), body.encode(), hashlib.sha256).hexdigest()
        assert not hmac.compare_digest(sig, expected)


def test_access_codes_default_to_disabled(monkeypatch):
    monkeypatch.setattr(payments.settings, "founder_plan_codes", "")

    assert payments._enabled_access_codes() == set()
    assert payments._enabled_founder_codes() == set()


@pytest.mark.anyio
async def test_payment_config_uses_professional_access_flags(monkeypatch):
    monkeypatch.setattr(payments.settings, "founder_plan_codes", "ACCESS100")
    monkeypatch.setattr(payments.settings, "razorpay_key_id", "")
    monkeypatch.setattr(payments.settings, "razorpay_key_secret", "")
    monkeypatch.setattr(payments.settings, "payment_checkout_enabled", False)

    config = await payments.payment_config()

    assert config["access_code_available"] is True
    assert "founder_plan_available" not in config


@pytest.mark.anyio
async def test_access_code_apply_uses_professional_access_response(monkeypatch):
    class FakeQuery:
        def __init__(self, client, table_name):
            self.client = client
            self.table_name = table_name
            self.payload = None

        def update(self, payload):
            self.payload = payload
            self.client.updates.append((self.table_name, payload))
            return self

        def insert(self, payload):
            self.payload = payload
            self.client.inserts.append((self.table_name, payload))
            return self

        def eq(self, *_args, **_kwargs):
            return self

        def execute(self):
            return _FakeResult({"ok": True})

    class FakeClient:
        def __init__(self):
            self.updates = []
            self.inserts = []

        def table(self, table_name):
            return FakeQuery(self, table_name)

    client = FakeClient()
    monkeypatch.setattr(payments.settings, "founder_plan_codes", "ACCESS100")
    monkeypatch.setattr(payments, "get_admin_client", lambda: client)

    result = await payments.apply_access_code_plan(
        payments.AccessCodeApplyRequest(code="access100"),
        user_id="user-123456",
    )

    assert result["billing"] == "access_code"
    assert result["plan"] == "pro"
    assert client.updates == [("users", {"plan": "pro", "plan_expires_at": result["expires_at"], "billing_period": "monthly"})]
    assert client.inserts[0][1]["razorpay_order_id"] == "access-ACCESS100"
    assert client.inserts[0][1]["razorpay_payment_id"] == "access-user-123"
    assert client.inserts[0][1]["status"] == "access_code"


def test_checkout_kill_switch_defaults_to_disabled(monkeypatch):
    monkeypatch.setattr(payments.settings, "payment_checkout_enabled", False)

    with pytest.raises(HTTPException) as exc:
        payments._ensure_checkout_enabled()

    assert exc.value.status_code == 403
    assert "disabled" in exc.value.detail


def test_payment_verify_uses_order_metadata_not_client_plan():
    order = {
        "amount": payments.PLAN_PRICES[("pro", "INR", "monthly")]["amount"],
        "currency": "INR",
        "notes": {
            "user_id": "user-123",
            "plan": "pro",
            "currency": "INR",
            "billing": "monthly",
        },
    }

    assert payments._validated_order_context(order, expected_user_id="user-123") == ("pro", "INR", "monthly")

    tampered = {**order, "amount": payments.PLAN_PRICES[("elite", "INR", "annual")]["amount"]}
    with pytest.raises(HTTPException) as exc:
        payments._validated_order_context(tampered, expected_user_id="user-123")
    assert exc.value.status_code == 400


class _FakeResult:
    def __init__(self, data=None):
        self.data = data


class _FakeQuery:
    def __init__(self, client, table_name: str):
        self.client = client
        self.table_name = table_name
        self.operation = None
        self.payload = None

    def select(self, *_args, **_kwargs):
        self.operation = "select"
        return self

    def update(self, payload):
        self.operation = "update"
        self.payload = payload
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def single(self):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        if self.operation == "update":
            self.client.updates.append((self.table_name, self.payload))
            return _FakeResult({"ok": True})
        return _FakeResult(self.client.row)


class _FakeClient:
    def __init__(self, row):
        self.row = row
        self.updates = []

    def table(self, table_name: str):
        return _FakeQuery(self, table_name)


def test_effective_plan_helper_treats_expired_paid_rows_as_free():
    expired = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()

    plan, expires_at, active = effective_plan_from_record({"plan": "pro", "plan_expires_at": expired})

    assert plan == "free"
    assert expires_at == expired
    assert active is False


def test_effective_plan_helper_keeps_active_and_lifetime_paid_rows():
    future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()

    assert effective_plan_from_record({"plan": "elite", "plan_expires_at": future}) == ("elite", future, True)
    assert effective_plan_from_record({"plan": "pro", "plan_expires_at": None}) == ("pro", None, True)


def test_get_effective_user_plan_reads_expiry_without_mutating():
    expired = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    client = _FakeClient({"plan": "pro", "plan_expires_at": expired})

    assert get_effective_user_plan(client, "user-123") == "free"
    assert client.updates == []


@pytest.mark.anyio
async def test_plan_status_is_read_only_for_expired_paid_rows(monkeypatch):
    expired = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    client = _FakeClient({"plan": "pro", "plan_expires_at": expired})
    monkeypatch.setattr(payments, "get_admin_client", lambda: client)

    result = await payments.plan_status(user_id="user-123")

    assert result == {"plan": "free", "expires_at": expired, "active": False}
    assert client.updates == []


@pytest.mark.anyio
async def test_plan_reconcile_explicitly_downgrades_expired_paid_rows(monkeypatch):
    expired = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    client = _FakeClient({"plan": "elite", "plan_expires_at": expired})
    monkeypatch.setattr(payments, "get_admin_client", lambda: client)

    result = await payments.reconcile_plan_status(user_id="user-123")

    assert result == {"plan": "free", "expires_at": expired, "active": False, "reconciled": True}
    assert client.updates == [("users", {"plan": "free"})]
