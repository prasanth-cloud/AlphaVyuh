from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.middleware.auth import get_current_user_id, get_current_user_token
from app.services.supabase import get_user_client

router = APIRouter(prefix="/api/v1/setups", tags=["setups"])
logger = logging.getLogger(__name__)

SetupDirection = Literal["long", "short"]
SetupStatus = Literal["planned", "ready", "triggered", "open", "closed", "invalidated", "cancelled"]
SetupSource = Literal["scanner", "chart", "watchlist", "manual"]
REVIEW_INVALIDATING_FIELDS = {
    "direction",
    "entry_low",
    "entry_high",
    "stop_price",
    "target_price",
    "planned_quantity",
    "thesis",
    "invalidation_reason",
}


class SetupCreate(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=32)
    direction: SetupDirection
    status: SetupStatus = "planned"
    strategy_tag: str | None = Field(default=None, max_length=64)
    entry_low: float | None = Field(default=None, gt=0)
    entry_high: float | None = Field(default=None, gt=0)
    stop_price: float | None = Field(default=None, gt=0)
    target_price: float | None = Field(default=None, gt=0)
    planned_quantity: int | None = Field(default=None, gt=0)
    thesis: str | None = Field(default=None, max_length=1200)
    invalidation_reason: str | None = Field(default=None, max_length=800)
    source: SetupSource = "manual"
    source_scanner_candidate_id: UUID | None = None
    scanner_context: dict[str, Any] | None = None
    chart_snapshot: dict[str, Any] | None = None


class SetupPatch(BaseModel):
    direction: SetupDirection | None = None
    status: SetupStatus | None = None
    strategy_tag: str | None = Field(default=None, max_length=64)
    entry_low: float | None = Field(default=None, gt=0)
    entry_high: float | None = Field(default=None, gt=0)
    stop_price: float | None = Field(default=None, gt=0)
    target_price: float | None = Field(default=None, gt=0)
    planned_quantity: int | None = Field(default=None, gt=0)
    thesis: str | None = Field(default=None, max_length=1200)
    invalidation_reason: str | None = Field(default=None, max_length=800)
    source: SetupSource | None = None
    source_scanner_candidate_id: UUID | None = None
    scanner_context: dict[str, Any] | None = None
    chart_snapshot: dict[str, Any] | None = None


def _normalize_symbol(value: str) -> str:
    symbol = value.strip().upper()
    if not symbol:
        raise HTTPException(status_code=422, detail="Symbol is required")
    return symbol


def _apply_plan_derivatives(payload: dict[str, Any]) -> dict[str, Any]:
    """Validate complete plan geometry and derive risk fields server-side."""
    result = dict(payload)
    if "symbol" in result:
        result["symbol"] = _normalize_symbol(str(result["symbol"]))

    entry_low = result.get("entry_low")
    entry_high = result.get("entry_high")
    stop_price = result.get("stop_price")
    target_price = result.get("target_price")
    direction = result.get("direction")

    if entry_low is not None and entry_high is not None and entry_high < entry_low:
        raise HTTPException(status_code=422, detail="Entry high must be greater than or equal to entry low")

    entry = entry_low if entry_low is not None else entry_high
    if entry_low is not None and entry_high is not None:
        entry = (entry_low + entry_high) / 2

    if entry is not None and stop_price is not None and target_price is not None:
        if direction == "long":
            risk = entry - stop_price
            reward = target_price - entry
        else:
            risk = stop_price - entry
            reward = entry - target_price
        if risk <= 0 or reward <= 0:
            raise HTTPException(
                status_code=422,
                detail="Entry, stop, and target must form valid geometry for the selected direction",
            )
        result["planned_rr"] = round(reward / risk, 4)
        quantity = result.get("planned_quantity")
        result["planned_risk_amount"] = round(risk * quantity, 4) if quantity is not None else None
    else:
        result["planned_rr"] = None
        result["planned_risk_amount"] = None

    return result


def _create_payload(body: SetupCreate, user_id: str) -> dict[str, Any]:
    payload = body.model_dump(exclude_none=True)
    payload = _apply_plan_derivatives(payload)
    if "source_scanner_candidate_id" in payload:
        payload["source_scanner_candidate_id"] = str(payload["source_scanner_candidate_id"])
    payload["user_id"] = user_id
    return payload


async def _get_owned_setup(sb: Any, setup_id: UUID, user_id: str) -> dict[str, Any]:
    try:
        result = (
            sb.table("setups")
            .select("*")
            .eq("id", str(setup_id))
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Setups are temporarily unavailable") from exc
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Setup not found")
    return result.data


@router.get("")
async def list_setups(
    symbol: str | None = Query(default=None, max_length=32),
    status_filter: SetupStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=100),
    user_id: str = Depends(get_current_user_id),
    user_jwt: str = Depends(get_current_user_token),
):
    sb = get_user_client(user_jwt)
    query = sb.table("setups").select("*").eq("user_id", user_id)
    if symbol:
        query = query.eq("symbol", _normalize_symbol(symbol))
    if status_filter:
        query = query.eq("status", status_filter)
    try:
        result = query.order("updated_at", desc=True).limit(limit).execute()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Setups are temporarily unavailable") from exc
    return {"setups": result.data or []}


@router.post("")
async def create_setup(
    body: SetupCreate,
    user_id: str = Depends(get_current_user_id),
    user_jwt: str = Depends(get_current_user_token),
):
    payload = _create_payload(body, user_id)
    try:
        result = get_user_client(user_jwt).table("setups").insert(payload).execute()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Setup could not be saved") from exc
    if not result.data:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Setup save returned no data")
    created = result.data[0]
    candidate_id = payload.get("source_scanner_candidate_id")
    if candidate_id:
        try:
            sb = get_user_client(user_jwt)
            sb.table("scanner_candidates").update({
                "setup_id": created["id"],
                "status": "converted",
            }).eq("id", candidate_id).eq("user_id", user_id).execute()
        except Exception:
            # The setup's source_scanner_candidate_id is the authoritative
            # forward link; the back-link is best-effort for older schemas or
            # a transient candidate write failure.
            logger.warning("Could not update scanner candidate back-link for setup %s", created.get("id"), exc_info=True)
    return created


@router.get("/{setup_id}")
async def get_setup(
    setup_id: UUID,
    user_id: str = Depends(get_current_user_id),
    user_jwt: str = Depends(get_current_user_token),
):
    return await _get_owned_setup(get_user_client(user_jwt), setup_id, user_id)


@router.patch("/{setup_id}")
async def update_setup(
    setup_id: UUID,
    body: SetupPatch,
    user_id: str = Depends(get_current_user_id),
    user_jwt: str = Depends(get_current_user_token),
):
    sb = get_user_client(user_jwt)
    existing = await _get_owned_setup(sb, setup_id, user_id)
    changes = body.model_dump(exclude_unset=True)
    if not changes:
        return existing

    merged = {**existing, **changes}
    merged = _apply_plan_derivatives(merged)
    payload = {
        key: merged.get(key)
        for key in (
            "direction",
            "status",
            "strategy_tag",
            "entry_low",
            "entry_high",
            "stop_price",
            "target_price",
            "planned_quantity",
            "planned_rr",
            "planned_risk_amount",
            "thesis",
            "invalidation_reason",
            "source",
            "source_scanner_candidate_id",
            "scanner_context",
            "chart_snapshot",
        )
        if key in merged
    }
    if isinstance(payload.get("source_scanner_candidate_id"), UUID):
        payload["source_scanner_candidate_id"] = str(payload["source_scanner_candidate_id"])
    if REVIEW_INVALIDATING_FIELDS.intersection(changes):
        payload["review_status"] = "not_evaluated"
        payload["last_reviewed_at"] = None
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    try:
        result = sb.table("setups").update(payload).eq("id", str(setup_id)).eq("user_id", user_id).execute()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Setup could not be updated") from exc
    if result.data:
        return result.data[0]
    return {**existing, **payload, "id": str(setup_id), "user_id": user_id}
