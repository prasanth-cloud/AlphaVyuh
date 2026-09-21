from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.middleware.auth import get_current_user_id, get_current_user_token
from app.services.supabase import get_user_client

router = APIRouter(prefix="/api/v1/journal", tags=["trade-reviews"])

PlanAdherence = Literal["followed", "partial", "not_followed", "unknown"]
ReviewSource = Literal["manual", "generated"]


class TradeReviewWrite(BaseModel):
    plan_adherence: PlanAdherence = "unknown"
    mistakes: str | None = Field(default=None, max_length=4000)
    lesson: str | None = Field(default=None, max_length=4000)
    follow_up: str | None = Field(default=None, max_length=4000)
    source: ReviewSource = "manual"


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _owned_entry(sb: Any, entry_id: UUID, user_id: str) -> dict[str, Any]:
    try:
        result = (
            sb.table("trade_journal")
            .select("id,user_id,status,setup_id")
            .eq("id", str(entry_id))
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Trade review is temporarily unavailable",
        ) from exc
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")
    return result.data


@router.get("/reviews")
async def list_trade_reviews(
    user_id: str = Depends(get_current_user_id),
    user_jwt: str = Depends(get_current_user_token),
):
    sb = get_user_client(user_jwt)
    try:
        result = (
            sb.table("trade_reviews")
            .select("*")
            .eq("user_id", user_id)
            .order("updated_at", desc=True)
            .limit(500)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Trade reviews are temporarily unavailable",
        ) from exc
    return {"reviews": result.data or []}


@router.get("/{entry_id}/review")
async def get_trade_review(
    entry_id: UUID,
    user_id: str = Depends(get_current_user_id),
    user_jwt: str = Depends(get_current_user_token),
):
    sb = get_user_client(user_jwt)
    _owned_entry(sb, entry_id, user_id)
    try:
        result = (
            sb.table("trade_reviews")
            .select("*")
            .eq("journal_entry_id", str(entry_id))
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Trade review is temporarily unavailable",
        ) from exc
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trade review not found")
    return result.data


@router.put("/{entry_id}/review")
async def save_trade_review(
    entry_id: UUID,
    body: TradeReviewWrite,
    user_id: str = Depends(get_current_user_id),
    user_jwt: str = Depends(get_current_user_token),
):
    sb = get_user_client(user_jwt)
    entry = _owned_entry(sb, entry_id, user_id)
    if entry.get("status") != "closed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Trade must be closed before review")

    mistakes = _clean(body.mistakes)
    lesson = _clean(body.lesson)
    follow_up = _clean(body.follow_up)
    if not mistakes and not lesson and not follow_up:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Add a mistake, lesson, or follow-up")

    completed = lesson is not None
    payload = {
        "user_id": user_id,
        "journal_entry_id": str(entry_id),
        "setup_id": entry.get("setup_id"),
        "status": "completed" if completed else "draft",
        "plan_adherence": body.plan_adherence,
        "mistakes": mistakes,
        "lesson": lesson,
        "follow_up": follow_up,
        "source": body.source,
        "reviewed_at": datetime.now(timezone.utc).isoformat() if completed else None,
    }
    try:
        result = (
            sb.table("trade_reviews")
            .upsert(payload, on_conflict="user_id,journal_entry_id")
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Trade review could not be saved",
        ) from exc
    if not result.data:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Trade review save returned no data")
    return result.data[0]
