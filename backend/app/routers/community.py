from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.middleware.auth import get_current_user_id
from app.services.supabase import get_admin_client

router = APIRouter(prefix="/api/v1/community", tags=["community"])


class ShareScreenRequest(BaseModel):
    screen_id: str
    title: str
    description: Optional[str] = None
    tags: list[str] = []


@router.get("/screens")
async def list_shared_screens(limit: int = 50, featured: bool = False):
    sb = get_admin_client()
    query = sb.table("shared_screens").select("*").order("upvotes", desc=True).limit(limit)
    if featured:
        query = query.eq("is_featured", True)
    res = query.execute()
    return res.data or []


@router.post("/screens")
async def share_screen(body: ShareScreenRequest, user_id: str = Depends(get_current_user_id)):
    sb = get_admin_client()
    res = sb.table("shared_screens").insert({
        "user_id": user_id,
        "screen_id": body.screen_id,
        "title": body.title,
        "description": body.description,
        "tags": body.tags,
    }).execute()
    if not res.data:
        raise HTTPException(400, "Failed to share screen")
    return res.data[0]


@router.post("/screens/{screen_id}/upvote")
async def upvote_screen(screen_id: str, user_id: str = Depends(get_current_user_id)):
    sb = get_admin_client()
    # Try inserting upvote (composite PK prevents double-voting)
    try:
        sb.table("screen_upvotes").insert({"user_id": user_id, "screen_id": screen_id}).execute()
    except Exception:
        raise HTTPException(409, "Already upvoted")

    # Increment upvotes counter
    res = sb.rpc("increment_upvotes", {"p_screen_id": screen_id}).execute()
    if res.data is not None:
        count = res.data
    else:
        # Fallback: count from table
        count_res = sb.table("screen_upvotes").select("*", count="exact").eq("screen_id", screen_id).execute()
        count = count_res.count or 0
        sb.table("shared_screens").update({"upvotes": count}).eq("id", screen_id).execute()

    screen_res = sb.table("shared_screens").select("upvotes").eq("id", screen_id).execute()
    upvotes = screen_res.data[0]["upvotes"] if screen_res.data else count
    return {"screen_id": screen_id, "upvotes": upvotes}


@router.delete("/screens/{screen_id}")
async def delete_shared_screen(screen_id: str, user_id: str = Depends(get_current_user_id)):
    sb = get_admin_client()
    sb.table("shared_screens").delete().eq("id", screen_id).eq("user_id", user_id).execute()
    return {"status": "deleted"}
