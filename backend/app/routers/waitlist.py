from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr

from app.services.supabase import get_admin_client

router = APIRouter(prefix="/api/v1", tags=["waitlist"])


class WaitlistRequest(BaseModel):
    email: EmailStr
    source: str = "landing"


@router.post("/waitlist")
async def join_waitlist(body: WaitlistRequest):
    client = get_admin_client()
    try:
        client.table("waitlist").insert(
            {"email": body.email, "source": body.source}
        ).execute()
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
