from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.middleware.auth import get_current_user_id, get_current_user_token
from app.services.supabase import get_user_client

router = APIRouter(prefix="/api/v1/workflow", tags=["workflow"])

Lifecycle = Literal[
    "idea",
    "watch",
    "ready",
    "triggered",
    "open",
    "closed",
    "reviewed",
    "invalidated",
    "ignored",
    "review_later",
]


class WorkflowStatePatch(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=32)
    watchlist_id: UUID | None = None
    source: str | None = Field(default=None, max_length=32)
    lifecycle: Lifecycle | None = None
    setup_type: str | None = Field(default=None, max_length=64)
    entry: float | None = None
    stop: float | None = None
    target: float | None = None
    position_size: float | None = None
    timeframe: str | None = Field(default=None, max_length=12)
    thesis: str | None = Field(default=None, max_length=1200)
    invalidation_rule: str | None = Field(default=None, max_length=800)
    scanner_context: dict[str, Any] | None = None
    confidence: int | None = Field(default=None, ge=1, le=5)
    setup_quality: int | None = Field(default=None, ge=1, le=5)
    notes: str | None = Field(default=None, max_length=1200)
    tags: list[str] | None = Field(default=None, max_length=12)
    pinned: bool | None = None
    review_later: bool | None = None
    ignored: bool | None = None
    broker_order_id: str | None = Field(default=None, max_length=128)
    journal_id: UUID | None = None


def _normalize_tags(tags: list[str] | None) -> list[str] | None:
    if tags is None:
        return None
    out: list[str] = []
    seen: set[str] = set()
    for raw in tags:
        tag = raw.strip().lower()[:32]
        if tag and tag not in seen:
            out.append(tag)
            seen.add(tag)
    return out[:12]


def _payload(body: WorkflowStatePatch, user_id: str) -> dict:
    payload = body.model_dump(exclude_none=True)
    payload["user_id"] = user_id
    payload["symbol"] = body.symbol.upper().strip()
    if "tags" in payload:
        payload["tags"] = _normalize_tags(body.tags)
    if "source" in payload:
        payload["source"] = str(payload["source"]).strip().lower()[:32] or "manual"
    if "timeframe" in payload:
        payload["timeframe"] = str(payload["timeframe"]).upper().strip()[:12] or "D"
    return payload


@router.get("/states")
async def list_states(
    symbols: str | None = Query(None, description="Comma separated symbols to limit the response."),
    watchlist_id: UUID | None = Query(None),
    user_id: str = Depends(get_current_user_id),
    token: str = Depends(get_current_user_token),
):
    sb = get_user_client(token)
    q = sb.table("workflow_states").select("*").eq("user_id", user_id)
    if watchlist_id:
        q = q.eq("watchlist_id", str(watchlist_id))
    if symbols:
        normalized = [s.strip().upper() for s in symbols.split(",") if s.strip()]
        if normalized:
            q = q.in_("symbol", normalized[:200])
    try:
        res = q.order("updated_at", desc=True).limit(500).execute()
        return {"states": res.data or []}
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Workflow state is temporarily unavailable") from exc


@router.put("/states/{symbol}")
async def upsert_state(
    symbol: str,
    body: WorkflowStatePatch,
    user_id: str = Depends(get_current_user_id),
    token: str = Depends(get_current_user_token),
):
    if symbol.upper() != body.symbol.upper():
        raise HTTPException(status_code=400, detail="Symbol mismatch")
    payload = _payload(body, user_id)
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    try:
        res = (
            get_user_client(token)
            .table("workflow_states")
            .upsert(payload, on_conflict="user_id,symbol")
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Workflow state could not be saved") from exc
    if not res.data:
        raise HTTPException(status_code=500, detail="Workflow state save returned no data")
    return res.data[0]


@router.post("/states/bulk")
async def bulk_upsert_states(
    body: list[WorkflowStatePatch],
    user_id: str = Depends(get_current_user_id),
    token: str = Depends(get_current_user_token),
):
    if len(body) > 200:
        raise HTTPException(status_code=400, detail="Bulk workflow update is limited to 200 symbols")
    rows = [_payload(item, user_id) for item in body]
    now = datetime.now(timezone.utc).isoformat()
    for row in rows:
        row["updated_at"] = now
    try:
        res = (
            get_user_client(token)
            .table("workflow_states")
            .upsert(rows, on_conflict="user_id,symbol")
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Workflow states could not be saved") from exc
    return {"states": res.data or []}
