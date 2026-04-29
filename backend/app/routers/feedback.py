import json
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.middleware.auth import get_current_user_id
from app.routers.waitlist import _require_admin
from app.services.supabase import get_admin_client, settings

router = APIRouter(prefix="/api/v1/feedback", tags=["feedback"])


class FeedbackCreateRequest(BaseModel):
    category: str = Field(default="general", pattern="^(general|bug|data_issue|feature_request)$")
    page: str | None = Field(default=None, max_length=300)
    symbol: str | None = Field(default=None, max_length=32)
    severity: str = Field(default="normal", pattern="^(low|normal|high)$")
    message: str = Field(min_length=3, max_length=2000)
    context: dict = Field(default_factory=dict)


class FeedbackStatusRequest(BaseModel):
    status: str = Field(pattern="^(new|triaged|resolved|closed)$")


def _fallback_email(client, user_id: str) -> str:
    result = client.table("users").select("email").eq("id", user_id).maybe_single().execute()
    email = (result.data or {}).get("email")
    return email or f"{user_id}@feedback.alphavyuh.local"


def _is_missing_feedback_table(exc: Exception) -> bool:
    text = str(exc).lower()
    return "feedback_reports" in text and ("does not exist" in text or "could not find" in text or "schema cache" in text)


def _feedback_storage_mode() -> str:
    mode = settings.feedback_storage_mode.strip().lower()
    return mode if mode in {"auto", "table", "waitlist"} else "auto"


def _use_waitlist_feedback() -> bool:
    return _feedback_storage_mode() == "waitlist"


def _waitlist_feedback_row(row: dict) -> dict:
    source = row.get("source") or "feedback-general"
    category = source.replace("feedback-", "", 1) if source.startswith("feedback-") else "general"
    notes = row.get("notes") or ""
    message = notes.split("\n\ncontext=", 1)[0]
    context = {"fallback_storage": "waitlist", "email": row.get("email")}
    if "\n\ncontext=" in notes:
        _, raw_context = notes.split("\n\ncontext=", 1)
        try:
            parsed_context = json.loads(raw_context)
            if isinstance(parsed_context, dict):
                context.update(parsed_context)
        except json.JSONDecodeError:
            pass
    status_map = {
        "new": "new",
        "invited": "triaged",
        "onboarded": "resolved",
        "rejected": "closed",
    }
    return {
        "id": row.get("id"),
        "user_id": None,
        "category": category,
        "page": context.get("page"),
        "symbol": context.get("symbol"),
        "severity": context.get("severity") or "normal",
        "message": message,
        "context": context,
        "status": status_map.get(row.get("status"), "new"),
        "created_at": row.get("created_at"),
    }


def _feedback_fallback_email(email: str) -> str:
    suffix = uuid4().hex[:10]
    if "@" not in email:
        return f"{suffix}@feedback.alphavyuh.local"
    local, domain = email.rsplit("@", 1)
    return f"{local}+feedback-{suffix}@{domain}"


def _feedback_to_waitlist_status(feedback_status: str) -> str:
    return {
        "new": "new",
        "triaged": "invited",
        "resolved": "onboarded",
        "closed": "rejected",
    }[feedback_status]


def _create_waitlist_feedback(client, body: FeedbackCreateRequest, user_id: str) -> dict:
    user_email = _fallback_email(client, user_id)
    fallback_context = {
        "user_id": user_id,
        "user_email": user_email,
        "page": body.page,
        "symbol": body.symbol.upper() if body.symbol else None,
        "severity": body.severity,
        "client": body.context,
    }
    fallback = {
        "email": _feedback_fallback_email(user_email),
        "source": f"feedback-{body.category}",
        "status": "new",
        "notes": f"{body.message.strip()}\n\ncontext={json.dumps(fallback_context, default=str)}",
    }
    row = client.table("waitlist").insert(fallback).execute().data[0]
    return _waitlist_feedback_row(row)


def _list_waitlist_feedback(client, status_filter: str | None = None) -> list[dict]:
    rows = (
        client.table("waitlist")
        .select("id,email,source,notes,status,created_at")
        .like("source", "feedback-%")
        .order("created_at", desc=True)
        .limit(200)
        .execute()
        .data or []
    )
    feedback = [_waitlist_feedback_row(row) for row in rows]
    if status_filter:
        feedback = [row for row in feedback if row["status"] == status_filter]
    return feedback


@router.post("")
async def create_feedback(body: FeedbackCreateRequest, user_id: str = Depends(get_current_user_id)):
    client = get_admin_client()
    if _use_waitlist_feedback():
        return {"feedback": _create_waitlist_feedback(client, body, user_id)}

    payload = {
        "user_id": user_id,
        "category": body.category,
        "page": body.page,
        "symbol": body.symbol.upper() if body.symbol else None,
        "severity": body.severity,
        "message": body.message.strip(),
        "context": body.context,
    }
    try:
        result = client.table("feedback_reports").insert(payload).execute()
    except Exception as exc:
        if _feedback_storage_mode() == "auto" and _is_missing_feedback_table(exc):
            return {"feedback": _create_waitlist_feedback(client, body, user_id)}
        raise HTTPException(status_code=500, detail="Could not save feedback") from exc
    if not result.data:
        raise HTTPException(status_code=500, detail="Could not save feedback")
    return {"feedback": result.data[0]}


@router.get("/admin")
async def list_feedback(status_filter: str | None = None, user_id: str = Depends(get_current_user_id)):
    _require_admin(user_id)
    client = get_admin_client()
    if _use_waitlist_feedback():
        return {"feedback": _list_waitlist_feedback(client, status_filter)}

    try:
        query = (
            client.table("feedback_reports")
            .select("id,user_id,category,page,symbol,severity,message,context,status,created_at")
            .order("created_at", desc=True)
            .limit(200)
        )
        if status_filter:
            query = query.eq("status", status_filter)
        return {"feedback": query.execute().data or []}
    except Exception as exc:
        if _feedback_storage_mode() != "auto" or not _is_missing_feedback_table(exc):
            raise
        return {"feedback": _list_waitlist_feedback(client, status_filter)}


@router.patch("/admin/{feedback_id}")
async def update_feedback_status(
    feedback_id: str,
    body: FeedbackStatusRequest,
    user_id: str = Depends(get_current_user_id),
):
    _require_admin(user_id)
    client = get_admin_client()
    if _use_waitlist_feedback():
        result = (
            client.table("waitlist")
            .update({"status": _feedback_to_waitlist_status(body.status)})
            .eq("id", feedback_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feedback not found")
        return {"feedback": _waitlist_feedback_row(result.data[0])}

    try:
        result = (
            client.table("feedback_reports")
            .update({"status": body.status})
            .eq("id", feedback_id)
            .execute()
        )
    except Exception as exc:
        if _feedback_storage_mode() != "auto" or not _is_missing_feedback_table(exc):
            raise
        result = (
            client.table("waitlist")
            .update({"status": _feedback_to_waitlist_status(body.status)})
            .eq("id", feedback_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feedback not found")
        return {"feedback": _waitlist_feedback_row(result.data[0])}
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feedback not found")
    return {"feedback": result.data[0]}
