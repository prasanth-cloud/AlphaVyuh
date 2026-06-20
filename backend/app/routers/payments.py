"""
Razorpay payment integration.
Flow:
  1. POST /api/v1/payments/create-order  → returns razorpay order_id
  2. Frontend opens Razorpay checkout
  3. POST /api/v1/payments/verify        → verifies signature, activates plan
  4. POST /api/v1/payments/webhook       → Razorpay webhook (optional server-side confirmation)
"""
import hashlib
import hmac
import logging
from collections.abc import Mapping
from datetime import datetime, timedelta, timezone

import razorpay
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.middleware.auth import get_current_user_id
from app.services.plans import effective_plan_from_record
from app.services.supabase import get_admin_client, settings  # SERVICE_ROLE: queries scoped by JWT-validated user_id; service-role needed for credential encryption

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/payments", tags=["payments"])

PLAN_PRICES = {
    ("pro",   "INR", "monthly"): {"amount": 199900,   "label": "AlphaVyuh Pro — ₹1,999/month",   "days": 30},
    ("pro",   "INR", "annual"):  {"amount": 1999900,  "label": "AlphaVyuh Pro — ₹19,999/year",   "days": 365},
    ("elite", "INR", "monthly"): {"amount": 499900,   "label": "AlphaVyuh Elite — ₹4,999/month", "days": 30},
    ("elite", "INR", "annual"):  {"amount": 4999900,  "label": "AlphaVyuh Elite — ₹49,999/year", "days": 365},
    ("pro",   "USD", "monthly"): {"amount": 2900,     "label": "AlphaVyuh Pro — $29/month",      "days": 30},
    ("pro",   "USD", "annual"):  {"amount": 27900,    "label": "AlphaVyuh Pro — $279/year",      "days": 365},
    ("elite", "USD", "monthly"): {"amount": 6900,     "label": "AlphaVyuh Elite — $69/month",    "days": 30},
    ("elite", "USD", "annual"):  {"amount": 69900,    "label": "AlphaVyuh Elite — $699/year",    "days": 365},
}

SUPPORTED_CURRENCIES = {"INR", "USD"}
SUPPORTED_BILLINGS   = {"monthly", "annual"}
ACCESS_CODE_PLAN_DAYS = 90


def _rzp_client():
    if not settings.razorpay_key_id or not settings.razorpay_key_secret:
        raise HTTPException(503, "Payment gateway is not configured")
    return razorpay.Client(
        auth=(settings.razorpay_key_id, settings.razorpay_key_secret)
    )


def _enabled_access_codes() -> set[str]:
    raw_codes = settings.access_plan_codes or settings.founder_plan_codes or ""
    return {
        code.strip().upper()
        for code in raw_codes.split(",")
        if code.strip()
    }


def _enabled_founder_codes() -> set[str]:
    """Compatibility alias for existing env naming and older tests."""
    return _enabled_access_codes()


def _ensure_checkout_enabled() -> None:
    if not settings.payment_checkout_enabled:
        raise HTTPException(403, "Payment checkout is unavailable for this account")


def _as_dict(value: object) -> dict:
    return dict(value) if isinstance(value, Mapping) else {}


def _amount_value(value: object, detail: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        raise HTTPException(400, detail)


def _validated_order_context(order: dict, *, expected_user_id: str) -> tuple[str, str, str]:
    notes = _as_dict(order.get("notes"))
    plan = str(notes.get("plan") or "").lower()
    currency = str(notes.get("currency") or order.get("currency") or "").upper()
    billing = str(notes.get("billing") or "").lower()
    user_id = str(notes.get("user_id") or "")
    order_currency = str(order.get("currency") or "").upper()
    key = (plan, currency, billing)
    if not expected_user_id or user_id != expected_user_id:
        raise HTTPException(400, "Payment order does not belong to this user")
    if key not in PLAN_PRICES:
        raise HTTPException(400, "Payment order metadata is invalid")
    if order_currency != currency:
        raise HTTPException(400, "Payment order currency does not match plan")
    expected_amount = int(PLAN_PRICES[key]["amount"])
    if _amount_value(order.get("amount"), "Payment order amount is invalid") != expected_amount:
        raise HTTPException(400, "Payment order amount does not match plan")
    return plan, currency, billing


def _validated_captured_payment_context(payment: dict, order: dict) -> tuple[str, str, str, str, str]:
    order_notes = _as_dict(order.get("notes"))
    user_id = str(order_notes.get("user_id") or "")
    plan, currency, billing = _validated_order_context(order, expected_user_id=user_id)
    order_id = str(order.get("id") or "")
    payment_id = str(payment.get("id") or "")

    if not payment_id:
        raise HTTPException(400, "Payment id is missing")
    if not order_id or str(payment.get("order_id") or "") != order_id:
        raise HTTPException(400, "Payment does not match order")
    if str(payment.get("status") or "").lower() != "captured":
        raise HTTPException(400, "Payment has not been captured")
    if str(payment.get("currency") or "").upper() != currency:
        raise HTTPException(400, "Payment currency does not match order")
    expected_amount = int(PLAN_PRICES[(plan, currency, billing)]["amount"])
    if _amount_value(payment.get("amount"), "Payment amount is invalid") != expected_amount:
        raise HTTPException(400, "Payment amount does not match order")

    return user_id, plan, currency, billing, payment_id


def _activate_paid_plan(
    *,
    user_id: str,
    plan: str,
    currency: str,
    billing: str,
    razorpay_order_id: str,
    razorpay_payment_id: str,
) -> dict:
    meta = PLAN_PRICES[(plan, currency, billing)]

    sb = get_admin_client()
    try:
        result = sb.rpc("activate_razorpay_payment", {
            "p_user_id": user_id,
            "p_plan": plan,
            "p_currency": currency,
            "p_billing": billing,
            "p_razorpay_order_id": razorpay_order_id,
            "p_razorpay_payment_id": razorpay_payment_id,
            "p_amount": meta["amount"],
            "p_plan_days": meta["days"],
        }).execute()
    except Exception as exc:
        logger.error("Razorpay payment activation RPC failed: %s", exc)
        raise HTTPException(500, "Payment activation is temporarily unavailable") from exc

    data = result.data
    row = data[0] if isinstance(data, list) and data else data if isinstance(data, dict) else None
    if not row:
        raise HTTPException(500, "Payment activation is temporarily unavailable")

    expires_at = row.get("expires_at") or row.get("plan_expires_at")
    if hasattr(expires_at, "isoformat"):
        expires_at = expires_at.isoformat()
    return {
        "status": row.get("status") or "success",
        "plan": row.get("plan") or plan,
        "expires_at": expires_at,
        "currency": row.get("currency") or currency,
        "billing": row.get("billing") or billing,
        "replayed": bool(row.get("replayed")),
    }


# ── Create Order ──────────────────────────────────────────────────────────────

class CreateOrderRequest(BaseModel):
    plan: str           # "pro" or "elite"
    currency: str = "INR"  # "INR" or "USD"
    billing: str = "monthly"  # "monthly" or "annual"


@router.get("/config")
async def payment_config():
    """Public payment readiness flags used by the frontend before opening checkout."""
    key = settings.razorpay_key_id or ""
    return {
        "gateway": "razorpay",
        "configured": bool(settings.razorpay_key_id and settings.razorpay_key_secret),
        "checkout_enabled": bool(settings.payment_checkout_enabled),
        "mode": "live" if key.startswith("rzp_live_") else "test" if key.startswith("rzp_test_") else "disabled",
        "key_prefix": key[:12] if key else "",
        "access_code_available": bool(_enabled_access_codes()),
    }


@router.post("/create-order")
async def create_order(
    body: CreateOrderRequest,
    user_id: str = Depends(get_current_user_id),
):
    _ensure_checkout_enabled()
    currency = (body.currency or "INR").upper()
    if currency not in SUPPORTED_CURRENCIES:
        raise HTTPException(400, f"Unsupported currency: {currency}")

    billing = (body.billing or "monthly").lower()
    if billing not in SUPPORTED_BILLINGS:
        raise HTTPException(400, f"Unsupported billing period: {billing}")

    key = (body.plan, currency, billing)
    if key not in PLAN_PRICES:
        raise HTTPException(400, "Invalid plan")

    meta = PLAN_PRICES[key]
    try:
        client = _rzp_client()
        order = client.order.create({
            "amount": meta["amount"],
            "currency": currency,
            "receipt": f"{user_id[:8]}-{body.plan}-{currency}-{billing}",
            "notes": {"user_id": user_id, "plan": body.plan, "currency": currency, "billing": billing},
        })
        return {
            "order_id": order["id"],
            "amount": meta["amount"],
            "currency": currency,
            "plan": body.plan,
            "billing": billing,
            "label": meta["label"],
        }
    except Exception as e:
        logger.error(f"Razorpay order create failed: {e}")
        raise HTTPException(500, "Payment gateway error")


@router.get("/plans")
async def list_plans(currency: str = "INR", billing: str = "monthly"):
    """Public plan prices for a given currency (INR or USD) and billing period (monthly or annual)."""
    c = (currency or "INR").upper()
    if c not in SUPPORTED_CURRENCIES:
        raise HTTPException(400, f"Unsupported currency: {c}")
    b = (billing or "monthly").lower()
    if b not in SUPPORTED_BILLINGS:
        raise HTTPException(400, f"Unsupported billing period: {b}")
    plans = []
    for plan_id in ("pro", "elite"):
        meta = PLAN_PRICES[(plan_id, c, b)]
        plans.append({
            "plan": plan_id,
            "currency": c,
            "billing": b,
            "amount": meta["amount"],
            "amount_display": meta["amount"] / 100,
            "label": meta["label"],
            "days": meta["days"],
        })
    return {"currency": c, "billing": b, "plans": plans}


# ── Verify Payment ────────────────────────────────────────────────────────────

class VerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    plan: str
    currency: str = "INR"
    billing: str = "monthly"


class AccessCodeApplyRequest(BaseModel):
    code: str


async def _apply_access_code_plan(
    body: AccessCodeApplyRequest,
    user_id: str = Depends(get_current_user_id),
):
    code = (body.code or "").strip().upper()
    if not code or code not in _enabled_access_codes():
        raise HTTPException(404, "Invalid access code")

    expires_at = (datetime.now(timezone.utc) + timedelta(days=ACCESS_CODE_PLAN_DAYS)).isoformat()
    sb = get_admin_client()
    sb.table("users").update({
        "plan": "pro",
        "plan_expires_at": expires_at,
        "billing_period": "monthly",
    }).eq("id", user_id).execute()

    try:
        sb.table("payment_logs").insert({
            "user_id": user_id,
            "razorpay_order_id": f"access-{code}",
            "razorpay_payment_id": f"access-{user_id[:8]}",
            "plan": "pro",
            "amount": 0,
            "currency": "INR",
            "status": "access_code",
        }).execute()
    except Exception:
        logger.info("Professional Access code applied without payment_logs row: user=%s", user_id)

    logger.info("Professional Access code applied: user=%s", user_id)
    return {"status": "success", "plan": "pro", "expires_at": expires_at, "billing": "access_code"}


@router.post("/access/apply")
async def apply_access_code_plan(
    body: AccessCodeApplyRequest,
    user_id: str = Depends(get_current_user_id),
):
    return await _apply_access_code_plan(body, user_id)


@router.post("/founder/apply")
async def apply_founder_plan(
    body: AccessCodeApplyRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Compatibility route for older clients. New clients should use /access/apply."""
    return await _apply_access_code_plan(body, user_id)


@router.post("/verify")
async def verify_payment(
    body: VerifyRequest,
    user_id: str = Depends(get_current_user_id),
):
    _ensure_checkout_enabled()
    if not settings.razorpay_key_secret:
        raise HTTPException(503, "Payment gateway is not configured")

    # Verify HMAC-SHA256 signature
    expected = hmac.new(
        settings.razorpay_key_secret.encode(),
        f"{body.razorpay_order_id}|{body.razorpay_payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected, body.razorpay_signature):
        raise HTTPException(400, "Invalid payment signature")

    try:
        client = _rzp_client()
        order = client.order.fetch(body.razorpay_order_id)
        payment = client.payment.fetch(body.razorpay_payment_id)
    except Exception as e:
        logger.warning("Razorpay fetch failed during verification: %s", e)
        raise HTTPException(400, "Payment could not be verified")

    order_user_id, plan, currency, billing, payment_id = _validated_captured_payment_context(payment, order)
    if order_user_id != user_id or payment_id != body.razorpay_payment_id:
        raise HTTPException(400, "Payment does not belong to this user")

    logger.info(f"Payment verified: user={user_id} plan={plan} currency={currency} billing={billing}")
    return _activate_paid_plan(
        user_id=user_id,
        plan=plan,
        currency=currency,
        billing=billing,
        razorpay_order_id=body.razorpay_order_id,
        razorpay_payment_id=body.razorpay_payment_id,
    )


# ── Webhook (server-side confirmation from Razorpay) ─────────────────────────

@router.post("/webhook")
async def razorpay_webhook(request: Request):
    _ensure_checkout_enabled()
    if not settings.razorpay_webhook_secret:
        raise HTTPException(503, "Payment webhook is not configured")

    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")

    expected = hmac.new(
        settings.razorpay_webhook_secret.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected, signature):
        raise HTTPException(400, "Invalid webhook signature")

    payload = await request.json()
    event = payload.get("event", "")

    if event == "payment.captured":
        event_payload = _as_dict(payload.get("payload"))
        payment_payload = _as_dict(event_payload.get("payment"))
        payment = _as_dict(payment_payload.get("entity"))
        order_id = str(payment.get("order_id") or "")
        if not order_id:
            raise HTTPException(400, "Webhook payment order id is missing")

        try:
            order = _rzp_client().order.fetch(order_id)
        except Exception as e:
            logger.warning("Razorpay order fetch failed during webhook verification: %s", e)
            raise HTTPException(400, "Webhook payment order could not be verified")

        user_id, plan, currency, billing, payment_id = _validated_captured_payment_context(payment, order)
        _activate_paid_plan(
            user_id=user_id,
            plan=plan,
            currency=currency,
            billing=billing,
            razorpay_order_id=order_id,
            razorpay_payment_id=payment_id,
        )
        logger.info(f"Webhook: plan activated user={user_id} plan={plan} currency={currency} billing={billing}")

    return {"status": "ok"}


# ── Get plan status ───────────────────────────────────────────────────────────

def _plan_status_from_record(data: dict | None) -> tuple[dict, bool]:
    raw_plan = str((data or {}).get("plan") or "free").lower()
    plan, expires, active = effective_plan_from_record(data)
    expired_paid_plan = raw_plan != "free" and plan == "free" and bool(expires)
    return {"plan": plan, "expires_at": expires, "active": active}, expired_paid_plan


@router.get("/status")
async def plan_status(user_id: str = Depends(get_current_user_id)):
    sb = get_admin_client()
    r = sb.table("users").select("plan, plan_expires_at").eq("id", user_id).single().execute()
    status, _expired_paid_plan = _plan_status_from_record(r.data)
    return status


@router.post("/status/reconcile")
async def reconcile_plan_status(user_id: str = Depends(get_current_user_id)):
    sb = get_admin_client()
    r = sb.table("users").select("plan, plan_expires_at").eq("id", user_id).single().execute()
    status, expired_paid_plan = _plan_status_from_record(r.data)
    if expired_paid_plan:
        sb.table("users").update({"plan": "free"}).eq("id", user_id).execute()
    return {**status, "reconciled": expired_paid_plan}
