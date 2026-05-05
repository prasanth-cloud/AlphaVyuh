from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.middleware.auth import get_current_user_id
from app.services.supabase import get_admin_client

router = APIRouter(prefix="/api/v1/workflow", tags=["workflow"])


class WorkflowSaveRequest(BaseModel):
    state: dict[str, Any] = Field(default_factory=dict)


@router.get("/state")
async def get_workflow_state(user_id: str = Depends(get_current_user_id)):
    sb = get_admin_client()
    result = (
        sb.table("workflow_states")
        .select("state, updated_at")
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not result.data:
        return {"state": None, "updated_at": None}
    return {
        "state": result.data.get("state") or {},
        "updated_at": result.data.get("updated_at"),
    }


@router.put("/state")
async def save_workflow_state(body: WorkflowSaveRequest, user_id: str = Depends(get_current_user_id)):
    sb = get_admin_client()
    result = (
        sb.table("workflow_states")
        .upsert({"user_id": user_id, "state": body.state}, on_conflict="user_id")
        .execute()
    )
    row = result.data[0] if result.data else {"state": body.state, "updated_at": None}
    return {
        "state": row.get("state") or body.state,
        "updated_at": row.get("updated_at"),
    }
