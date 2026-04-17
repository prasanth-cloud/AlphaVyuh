from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.middleware.auth import get_current_user_id
from app.services.supabase import get_admin_client

router = APIRouter(prefix="/api/v1", tags=["users"])

_SELECT = (
    "id, email, full_name, avatar_url, plan, plan_expires_at, "
    "onboarding_completed, telegram_chat_id, "
    "broker_type, broker_api_key, broker_connected_at, "
    "billing_region, billing_currency, created_at"
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
    broker_api_key: str | None = None       # returned masked
    broker_connected_at: str | None = None
    billing_region: str | None = "IN"       # "IN" | "NRI" | "US" | "INTL"
    billing_currency: str | None = "INR"    # "INR" | "USD"
    created_at: str


class UpdateUserRequest(BaseModel):
    full_name: str | None = None
    onboarding_completed: bool | None = None
    telegram_chat_id: str | None = None
    # Broker setup — set during onboarding or settings
    broker_type: str | None = None          # "zerodha" | "upstox" | "angel" | "fyers" | "none"
    broker_api_key: str | None = None
    broker_api_secret: str | None = None    # write-only, never returned
    # Billing preferences
    billing_region: str | None = None
    billing_currency: str | None = None


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
    row = result.data
    # Mask API key — show only last 4 chars
    if row.get("broker_api_key"):
        key = row["broker_api_key"]
        row["broker_api_key"] = ("*" * (len(key) - 4) + key[-4:]) if len(key) > 4 else "****"
    return row


@router.patch("/me", response_model=UserResponse)
async def update_me(
    body: UpdateUserRequest,
    user_id: str = Depends(get_current_user_id),
):
    updates: dict = {}
    if body.full_name is not None:
        updates["full_name"] = body.full_name
    if body.onboarding_completed is not None:
        updates["onboarding_completed"] = body.onboarding_completed
    if body.telegram_chat_id is not None:
        updates["telegram_chat_id"] = body.telegram_chat_id or None
    if body.broker_type is not None:
        updates["broker_type"] = body.broker_type if body.broker_type != "none" else None
    if body.broker_api_key is not None:
        updates["broker_api_key"] = body.broker_api_key or None
    if body.broker_api_secret is not None:
        updates["broker_api_secret"] = body.broker_api_secret or None
    if body.broker_type or body.broker_api_key:
        import datetime
        updates["broker_connected_at"] = datetime.datetime.utcnow().isoformat()
    if body.billing_region is not None:
        if body.billing_region not in ("IN", "NRI", "US", "INTL"):
            raise HTTPException(400, "Invalid billing_region")
        updates["billing_region"] = body.billing_region
    if body.billing_currency is not None:
        if body.billing_currency not in ("INR", "USD"):
            raise HTTPException(400, "Invalid billing_currency")
        updates["billing_currency"] = body.billing_currency

    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    client = get_admin_client()
    result = (
        client.table("users")
        .update(updates)
        .eq("id", user_id)
        .select(_SELECT)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    row = result.data
    if row.get("broker_api_key"):
        key = row["broker_api_key"]
        row["broker_api_key"] = ("*" * (len(key) - 4) + key[-4:]) if len(key) > 4 else "****"
    return row
