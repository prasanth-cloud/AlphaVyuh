from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.middleware.auth import get_current_user_id
from app.services.supabase import get_admin_client

router = APIRouter(prefix="/api/v1", tags=["users"])


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str | None
    avatar_url: str | None
    plan: str
    plan_expires_at: str | None
    onboarding_completed: bool
    created_at: str


class UpdateUserRequest(BaseModel):
    full_name: str | None = None
    onboarding_completed: bool | None = None


@router.get("/me", response_model=UserResponse)
async def get_me(user_id: str = Depends(get_current_user_id)):
    client = get_admin_client()
    result = (
        client.table("users")
        .select("id, email, full_name, avatar_url, plan, plan_expires_at, onboarding_completed, created_at")
        .eq("id", user_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return result.data


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

    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    client = get_admin_client()
    result = (
        client.table("users")
        .update(updates)
        .eq("id", user_id)
        .select("id, email, full_name, avatar_url, plan, plan_expires_at, onboarding_completed, created_at")
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return result.data
