import secrets
import string

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr

from app.middleware.auth import get_current_user_id
from app.services.supabase import get_admin_client  # SERVICE_ROLE: permitted — no user context
from app.services.supabase import settings

router = APIRouter(prefix="/api/v1", tags=["waitlist"])

PROFESSIONAL_ACCESS_PLAN = "professional_access"
LEGACY_INVITE_PLANS = {"founder"}  # Older invite codes normalize to Professional Access.


class WaitlistRequest(BaseModel):
    email: EmailStr
    source: str = "landing"
    invite_code: str | None = None


class InviteCreateRequest(BaseModel):
    email: EmailStr | None = None
    max_uses: int = 1
    plan: str = PROFESSIONAL_ACCESS_PLAN


def _admin_emails() -> set[str]:
    return {e.strip().lower() for e in (settings.admin_emails or "").split(",") if e.strip()}


def _require_admin(user_id: str) -> None:
    if not _admin_emails():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access is not configured")
    client = get_admin_client()
    result = client.table("users").select("email").eq("id", user_id).maybe_single().execute()
    email = (result.data or {}).get("email", "").lower()
    if email not in _admin_emails():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")


def _new_invite_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "AV-" + "".join(secrets.choice(alphabet) for _ in range(8))


def _normalize_invite_plan(plan: str | None) -> str:
    normalized = (plan or "").strip().lower()
    if not normalized or normalized in LEGACY_INVITE_PLANS:
        return PROFESSIONAL_ACCESS_PLAN
    return normalized


def _is_missing_launch_column(exc: Exception) -> bool:
    text = str(exc).lower()
    return any(column in text for column in ("invite_code", "status", "source"))


def _insert_waitlist_row(client, body: WaitlistRequest) -> None:
    payload = {"email": body.email, "source": body.source, "invite_code": body.invite_code}
    try:
        client.table("waitlist").insert(payload).execute()
        return
    except Exception as insert_exc:
        # Production may briefly run before the launch-readiness migration is applied.
        # Preserve the public signup path by falling back toward the original schema.
        if not _is_missing_launch_column(insert_exc):
            raise

    try:
        client.table("waitlist").insert({"email": body.email, "source": body.source}).execute()
    except Exception as fallback_exc:
        if "source" not in str(fallback_exc).lower():
            raise
        client.table("waitlist").insert({"email": body.email}).execute()


@router.post("/waitlist")
async def join_waitlist(body: WaitlistRequest):
    client = get_admin_client()
    try:
        _insert_waitlist_row(client, body)
    except Exception as e:
        # Supabase raises an exception on unique constraint violation
        if "duplicate" in str(e).lower() or "unique" in str(e).lower() or "23505" in str(e):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Already registered",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to join waitlist",
        )
    return {"message": "You're on the list!"}


@router.get("/waitlist/admin")
async def list_waitlist(user_id: str = Depends(get_current_user_id)):
    _require_admin(user_id)
    client = get_admin_client()
    rows = (
        client.table("waitlist")
        .select("id,email,source,invite_code,status,created_at")
        .order("created_at", desc=True)
        .limit(200)
        .execute()
        .data or []
    )
    return {"waitlist": rows}


@router.post("/invite-codes")
async def create_invite_code(body: InviteCreateRequest, user_id: str = Depends(get_current_user_id)):
    _require_admin(user_id)
    client = get_admin_client()
    code = _new_invite_code()
    row = {
        "code": code,
        "email": str(body.email).lower() if body.email else None,
        "max_uses": max(1, min(body.max_uses, 100)),
        "uses": 0,
        "plan": _normalize_invite_plan(body.plan),
        "created_by": user_id,
    }
    result = client.table("invite_codes").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create invite code")
    return result.data[0]


@router.get("/invite-codes/{code}")
async def validate_invite_code(code: str):
    client = get_admin_client()
    normalized = code.strip().upper()
    try:
        result = (
            client.table("invite_codes")
            .select("code,email,max_uses,uses,plan,expires_at,disabled")
            .eq("code", normalized)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        if "Missing response" in str(exc) or "'code': '204'" in str(exc):
            raise HTTPException(status_code=404, detail="Invalid invite code") from exc
        raise
    rows = result.data or []
    data = rows[0] if rows else None
    if not data or data.get("disabled") or int(data.get("uses") or 0) >= int(data.get("max_uses") or 1):
        raise HTTPException(status_code=404, detail="Invalid invite code")
    return {"valid": True, "code": data["code"], "plan": _normalize_invite_plan(data.get("plan"))}
