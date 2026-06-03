"""Tests for payment plan pricing and signature verification."""
import asyncio
import hashlib
import hmac
import json
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
    assert "unavailable for this account" in exc.value.detail


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


def _razorpay_order(
    *,
    user_id: str = "user-123",
    plan: str = "pro",
    currency: str = "INR",
    billing: str = "monthly",
    order_id: str = "order_paid",
    amount: int | None = None,
):
    return {
        "id": order_id,
        "amount": amount if amount is not None else payments.PLAN_PRICES[(plan, currency, billing)]["amount"],
        "currency": currency,
        "notes": {
            "user_id": user_id,
            "plan": plan,
            "currency": currency,
            "billing": billing,
        },
    }


def test_payment_context_uses_order_metadata_not_payment_notes():
    order = _razorpay_order(user_id="user-123", plan="pro", currency="INR", billing="monthly")
    payment = {
        "id": "pay_123",
        "order_id": order["id"],
        "amount": payments.PLAN_PRICES[("pro", "INR", "monthly")]["amount"],
        "currency": "INR",
        "status": "captured",
        "notes": {
            "user_id": "attacker",
            "plan": "elite",
            "currency": "USD",
            "billing": "annual",
        },
    }

    assert payments._validated_captured_payment_context(payment, order) == (
        "user-123",
        "pro",
        "INR",
        "monthly",
        "pay_123",
    )


def test_payment_context_rejects_amount_or_currency_mismatch():
    order = _razorpay_order(user_id="user-123", plan="pro", currency="INR", billing="monthly")
    payment = {
        "id": "pay_123",
        "order_id": order["id"],
        "amount": payments.PLAN_PRICES[("elite", "INR", "monthly")]["amount"],
        "currency": "INR",
        "status": "captured",
    }

    with pytest.raises(HTTPException) as exc:
        payments._validated_captured_payment_context(payment, order)
    assert exc.value.status_code == 400

    payment["amount"] = payments.PLAN_PRICES[("pro", "INR", "monthly")]["amount"]
    payment["currency"] = "USD"
    with pytest.raises(HTTPException) as exc:
        payments._validated_captured_payment_context(payment, order)
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


class _ActivationQuery:
    def __init__(self, client, table_name: str):
        self.client = client
        self.table_name = table_name
        self.operation = None
        self.payload = None
        self.eq_args = None

    def update(self, payload):
        self.operation = "update"
        self.payload = payload
        return self

    def insert(self, payload):
        self.operation = "insert"
        self.payload = payload
        return self

    def eq(self, *args):
        self.eq_args = args
        return self

    def execute(self):
        if self.operation == "update":
            self.client.updates.append((self.table_name, self.payload, self.eq_args))
        elif self.operation == "insert":
            self.client.inserts.append((self.table_name, self.payload))
        return _FakeResult({"ok": True})


class _ActivationClient:
    def __init__(self):
        self.updates = []
        self.inserts = []

    def table(self, table_name: str):
        return _ActivationQuery(self, table_name)


class _OrderApi:
    def __init__(self, order):
        self.order = order

    def fetch(self, order_id):
        assert order_id == self.order["id"]
        return self.order


class _PaymentApi:
    def __init__(self, payment):
        self.payment = payment

    def fetch(self, payment_id):
        assert payment_id == self.payment["id"]
        return self.payment


class _RazorpayClient:
    def __init__(self, order, payment=None):
        self.order = _OrderApi(order)
        self.payment = _PaymentApi(payment or {})


class _WebhookRequest:
    def __init__(self, body: bytes, signature: str):
        self._body = body
        self.headers = {"X-Razorpay-Signature": signature}

    async def body(self):
        return self._body

    async def json(self):
        return json.loads(self._body)


def test_webhook_activates_from_fetched_order_not_payment_notes(monkeypatch):
    order = _razorpay_order(user_id="user-123", plan="pro", currency="INR", billing="monthly")
    payment = {
        "id": "pay_123",
        "order_id": order["id"],
        "amount": payments.PLAN_PRICES[("pro", "INR", "monthly")]["amount"],
        "currency": "INR",
        "status": "captured",
        "notes": {
            "user_id": "attacker",
            "plan": "elite",
            "currency": "USD",
            "billing": "annual",
        },
    }
    payload = {"event": "payment.captured", "payload": {"payment": {"entity": payment}}}
    body = json.dumps(payload, separators=(",", ":")).encode()
    secret = "webhook-secret"
    signature = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    client = _ActivationClient()

    monkeypatch.setattr(payments.settings, "payment_checkout_enabled", True)
    monkeypatch.setattr(payments.settings, "razorpay_webhook_secret", secret)
    monkeypatch.setattr(payments, "_rzp_client", lambda: _RazorpayClient(order))
    monkeypatch.setattr(payments, "get_admin_client", lambda: client)

    result = asyncio.run(payments.razorpay_webhook(_WebhookRequest(body, signature)))

    assert result == {"status": "ok"}
    assert client.updates[0][0] == "users"
    assert client.updates[0][1]["plan"] == "pro"
    assert client.updates[0][1]["billing_currency"] == "INR"
    assert client.updates[0][2] == ("id", "user-123")
    assert client.inserts[0][1]["user_id"] == "user-123"
    assert client.inserts[0][1]["razorpay_payment_id"] == "pay_123"
    assert client.inserts[0][1]["amount"] == payments.PLAN_PRICES[("pro", "INR", "monthly")]["amount"]


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


class TestWebhookPlanUpdate:
    """Verify that webhook extracts plan from notes and updates users table."""

    def _webhook_payload(self, user_id: str, plan: str = "pro", currency: str = "INR", billing: str = "monthly"):
        return {
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_test123",
                        "currency": currency,
                        "notes": {
                            "user_id": user_id,
                            "plan": plan,
                            "currency": currency,
                            "billing": billing,
                        },
                    }
                }
            },
        }

    @pytest.mark.anyio
    async def test_webhook_updates_user_plan_in_db(self, monkeypatch):
        client = _FakeClient(None)
        monkeypatch.setattr(payments, "get_admin_client", lambda: client)
        monkeypatch.setattr(payments.settings, "razorpay_webhook_secret", "webhook_secret")
        monkeypatch.setattr(payments.settings, "payment_checkout_enabled", True)

        payload = self._webhook_payload("user-abc", plan="pro", currency="INR", billing="monthly")
        import json
        body = json.dumps(payload).encode()
        sig = hmac.new(b"webhook_secret", body, hashlib.sha256).hexdigest()

        class FakeRequest:
            headers = {"X-Razorpay-Signature": sig}
            async def body(self):
                return body
            async def json(self):
                return payload

        result = await payments.razorpay_webhook(FakeRequest())

        assert result == {"status": "ok"}
        assert len(client.updates) == 1
        table, update_payload = client.updates[0]
        assert table == "users"
        assert update_payload["plan"] == "pro"
        assert update_payload["billing_currency"] == "INR"
        assert update_payload["billing_period"] == "monthly"
        assert "plan_expires_at" in update_payload

    @pytest.mark.anyio
    async def test_webhook_rejects_invalid_signature(self, monkeypatch):
        monkeypatch.setattr(payments.settings, "razorpay_webhook_secret", "webhook_secret")
        monkeypatch.setattr(payments.settings, "payment_checkout_enabled", True)

        class FakeRequest:
            headers = {"X-Razorpay-Signature": "invalid"}
            async def body(self):
                return b'{"event":"payment.captured"}'
            async def json(self):
                return {"event": "payment.captured"}

        with pytest.raises(HTTPException) as exc:
            await payments.razorpay_webhook(FakeRequest())
        assert exc.value.status_code == 400
