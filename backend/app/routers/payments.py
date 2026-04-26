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
from datetime import datetime, timedelta, timezone

import razorpay
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.middleware.auth import get_current_user_id
from app.services.supabase import get_admin_client, settings

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
FOUNDER_PLAN_DAYS = 90


def _rzp_client():
    if not settings.razorpay_key_id or not settings.razorpay_key_secret:
        raise HTTPException(503, "Payment gateway is not configured")
    return razorpay.Client(
        auth=(settings.razorpay_key_id, settings.razorpay_key_secret)
    )


def _enabled_founder_codes() -> set[str]:
    return {
        code.strip().upper()
        for code in (settings.founder_plan_codes or "").split(",")
        if code.strip()
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
        "mode": "live" if key.startswith("rzp_live_") else "test" if key.startswith("rzp_test_") else "disabled",
        "key_prefix": key[:12] if key else "",
        "founder_plan_available": bool(_enabled_founder_codes()),
    }


@router.post("/create-order")
async def create_order(
    body: CreateOrderRequest,
    user_id: str = Depends(get_current_user_id),
):
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


class FounderApplyRequest(BaseModel):
    code: str


@router.post("/founder/apply")
async def apply_founder_plan(
    body: FounderApplyRequest,
    user_id: str = Depends(get_current_user_id),
):
    code = (body.code or "").strip().upper()
    if not code or code not in _enabled_founder_codes():
        raise HTTPException(404, "Invalid founder code")

    expires_at = (datetime.now(timezone.utc) + timedelta(days=FOUNDER_PLAN_DAYS)).isoformat()
    sb = get_admin_client()
    sb.table("users").update({
        "plan": "pro",
        "plan_expires_at": expires_at,
        "billing_period": "monthly",
    }).eq("id", user_id).execute()

    try:
        sb.table("payment_logs").insert({
            "user_id": user_id,
            "razorpay_order_id": f"founder-{code}",
            "razorpay_payment_id": f"founder-{user_id[:8]}",
            "plan": "pro",
            "amount": 0,
            "currency": "INR",
            "status": "founder",
        }).execute()
    except Exception:
        logger.info("Founder plan applied without payment_logs row: user=%s", user_id)

    logger.info("Founder plan applied: user=%s code=%s", user_id, code)
    return {"status": "success", "plan": "pro", "expires_at": expires_at, "billing": "founder"}


@router.post("/verify")
async def verify_payment(
    body: VerifyRequest,
    user_id: str = Depends(get_current_user_id),
):
    if not settings.razorpay_key_secret:
        raise HTTPException(503, "Payment gateway is not configured")

    # Verify HMAC-SHA256 signature
    expected = hmac.new(
        settings.razorpay_key_secret.encode(),
        f"{body.razorpay_order_id}|{body.razorpay_payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()

    if expected != body.razorpay_signature:
        raise HTTPException(400, "Invalid payment signature")

    currency = (body.currency or "INR").upper()
    billing = (body.billing or "monthly").lower()
    key = (body.plan, currency, billing)
    if key not in PLAN_PRICES:
        raise HTTPException(400, "Invalid plan")

    # Activate plan
    meta = PLAN_PRICES[key]
    expires_at = (datetime.now(timezone.utc) + timedelta(days=meta["days"])).isoformat()

    sb = get_admin_client()
    sb.table("users").update({
        "plan": body.plan,
        "plan_expires_at": expires_at,
        "billing_currency": currency,
        "billing_period": billing,
    }).eq("id", user_id).execute()

    # Log the payment
    sb.table("payment_logs").insert({
        "user_id": user_id,
        "razorpay_order_id": body.razorpay_order_id,
        "razorpay_payment_id": body.razorpay_payment_id,
        "plan": body.plan,
        "amount": meta["amount"],
        "currency": currency,
        "status": "success",
    }).execute()

    logger.info(f"Payment verified: user={user_id} plan={body.plan} currency={currency} billing={billing}")
    return {"status": "success", "plan": body.plan, "expires_at": expires_at, "currency": currency, "billing": billing}


# ── Webhook (server-side confirmation from Razorpay) ─────────────────────────

@router.post("/webhook")
async def razorpay_webhook(request: Request):
    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")

    expected = hmac.new(
        settings.razorpay_webhook_secret.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()

    if expected != signature:
        raise HTTPException(400, "Invalid webhook signature")

    payload = await request.json()
    event = payload.get("event", "")

    if event == "payment.captured":
        payment = payload["payload"]["payment"]["entity"]
        notes = payment.get("notes", {})
        user_id  = notes.get("user_id")
        plan     = notes.get("plan", "pro")
        currency = (notes.get("currency") or payment.get("currency") or "INR").upper()
        billing  = (notes.get("billing") or "monthly").lower()

        key = (plan, currency, billing)
        if user_id and key in PLAN_PRICES:
            days = PLAN_PRICES[key]["days"]
            expires_at = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
            sb = get_admin_client()
            sb.table("users").update({
                "plan": plan,
                "plan_expires_at": expires_at,
                "billing_currency": currency,
                "billing_period": billing,
            }).eq("id", user_id).execute()
            logger.info(f"Webhook: plan activated user={user_id} plan={plan} currency={currency} billing={billing}")

    return {"status": "ok"}


# ── Get plan status ───────────────────────────────────────────────────────────

@router.get("/status")
async def plan_status(user_id: str = Depends(get_current_user_id)):
    sb = get_admin_client()
    r = sb.table("users").select("plan, plan_expires_at").eq("id", user_id).single().execute()
    if not r.data:
        return {"plan": "free", "expires_at": None, "active": False}
    data = r.data
    plan = data.get("plan", "free")
    expires = data.get("plan_expires_at")
    active = False
    if plan != "free" and expires:
        active = datetime.fromisoformat(expires.replace("Z", "+00:00")) > datetime.now(timezone.utc)
        if not active:
            # Downgrade expired plan
            sb.table("users").update({"plan": "free"}).eq("id", user_id).execute()
            plan = "free"
    elif plan != "free":
        active = True  # no expiry = lifetime
    return {"plan": plan, "expires_at": expires, "active": active}
