from __future__ import annotations

import secrets
import string
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.middleware.auth import get_current_user_id
from app.services.supabase import get_admin_client  # SERVICE_ROLE: queries scoped by JWT-validated user_id

router = APIRouter(prefix="/api/v1", tags=["users"])

_SELECT = (
    "id, email, full_name, avatar_url, plan, plan_expires_at, "
    "onboarding_completed, telegram_chat_id, "
    "broker_type, broker_connected_at, "
    "billing_region, billing_currency, billing_period, "
    "referral_code, referred_by, created_at"
)


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str | None
    avatar_url: str | None
    plan: str
    plan_expires_at: str | None
    onboarding_completed: bool
    telegram_chat_id: str | None = None
    broker_type: str | None = None
    broker_connected_at: str | None = None
    billing_region: str | None = "IN"       # "IN" | "NRI" | "US" | "INTL"
    billing_currency: str | None = "INR"    # "INR" | "USD"
    billing_period: str | None = "monthly"  # "monthly" | "annual"
    referral_code: str | None = None
    referred_by: str | None = None
    created_at: str


class UpdateUserRequest(BaseModel):
    full_name: str | None = None
    onboarding_completed: bool | None = None
    telegram_chat_id: str | None = None
    # Broker setup — set during onboarding or settings
    broker_type: str | None = None          # "zerodha" | "upstox" | "angel" | "fyers" | "none"
    broker_api_key: str | None = None       # deprecated; broker app keys are backend-only
    broker_api_secret: str | None = None    # deprecated; never accepted from users
    # Billing preferences
    billing_region: str | None = None
    billing_currency: str | None = None
    billing_period: str | None = None


def _generate_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "AV-" + "".join(secrets.choice(alphabet) for _ in range(8))


def _sanitize_user_response(row: dict) -> dict:
    # Legacy DB columns may still exist, but broker app credentials are never
    # returned through user-profile APIs. Users connect through broker OAuth.
    row.pop("broker_api_key", None)
    row.pop("broker_api_secret", None)
    return row


@router.get("/me", response_model=UserResponse)
async def get_me(user_id: str = Depends(get_current_user_id)):
    client = get_admin_client()
    result = (
        client.table("users")
        .select(_SELECT)
        .eq("id", user_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return _sanitize_user_response(result.data)


@router.patch("/me", response_model=UserResponse)
async def update_me(
    body: UpdateUserRequest,
    user_id: str = Depends(get_current_user_id),
):
    client = get_admin_client()
    updates: dict = {}
    if body.full_name is not None:
        updates["full_name"] = body.full_name
    if body.onboarding_completed is not None:
        updates["onboarding_completed"] = body.onboarding_completed
    if body.telegram_chat_id is not None:
        updates["telegram_chat_id"] = body.telegram_chat_id or None
    broker = body.broker_type if body.broker_type != "none" else None
    if body.broker_type is not None:
        updates["broker_type"] = broker
    if body.broker_type:
        updates["broker_connected_at"] = datetime.now(UTC).isoformat()

    if body.broker_api_key is not None or body.broker_api_secret is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Broker API keys are managed by AlphaVyuh and cannot be saved on a user profile.",
        )
    if body.billing_region is not None:
        if body.billing_region not in ("IN", "NRI", "US", "INTL"):
            raise HTTPException(400, "Invalid billing_region")
        updates["billing_region"] = body.billing_region
    if body.billing_currency is not None:
        if body.billing_currency not in ("INR", "USD"):
            raise HTTPException(400, "Invalid billing_currency")
        updates["billing_currency"] = body.billing_currency
    if body.billing_period is not None:
        if body.billing_period not in ("monthly", "annual"):
            raise HTTPException(400, "Invalid billing_period")
        updates["billing_period"] = body.billing_period

    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    client.table("users").update(updates).eq("id", user_id).execute()
    result = client.table("users").select(_SELECT).eq("id", user_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return _sanitize_user_response(result.data)


@router.get("/referral-code")
async def get_referral_code(user_id: str = Depends(get_current_user_id)):
    client = get_admin_client()
    r = client.table("users").select("referral_code").eq("id", user_id).single().execute()
    code = r.data.get("referral_code") if r.data else None
    if not code:
        code = _generate_code()
        # Ensure uniqueness (up to 3 retries)
        for _ in range(3):
            exists = client.table("users").select("id").eq("referral_code", code).execute()
            if not exists.data:
                break
            code = _generate_code()
        client.table("users").update({"referral_code": code}).eq("id", user_id).execute()
    return {"referral_code": code, "referral_url": f"https://alphavyuh.in/signup?ref={code}"}


@router.post("/referral/apply")
async def apply_referral(body: dict, user_id: str = Depends(get_current_user_id)):
    code = (body.get("referral_code") or "").strip().upper()
    if not code:
        raise HTTPException(400, "No referral code provided")
    client = get_admin_client()
    # Find referrer
    ref = client.table("users").select("id, plan, plan_expires_at").eq("referral_code", code).execute()
    if not ref.data:
        raise HTTPException(404, "Invalid referral code")
    referrer = ref.data[0]
    if referrer["id"] == user_id:
        raise HTTPException(400, "Cannot use your own referral code")
    # Check if already set
    me = client.table("users").select("referred_by, plan").eq("id", user_id).single().execute()
    if me.data and me.data.get("referred_by"):
        raise HTTPException(400, "Referral already applied")
    client.table("users").update({"referred_by": referrer["id"]}).eq("id", user_id).execute()
    return {"status": "applied", "message": "Referral applied! Your referrer gets 30 days free when you upgrade."}
