"""
Email digest router — unsubscribe endpoint + manual trigger for admins.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse

from app.services.supabase import get_admin_client

router = APIRouter(prefix="/api/v1/email", tags=["email"])


@router.get("/unsubscribe")
async def unsubscribe(token: str = Query(..., min_length=16)):
    client = get_admin_client()

    result = client.table("email_unsubscribe_tokens") \
        .select("user_id") \
        .eq("token", token) \
        .limit(1) \
        .execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Invalid or expired unsubscribe link")

    user_id = result.data[0]["user_id"]
    client.table("users") \
        .update({"email_digest_enabled": False}) \
        .eq("id", user_id) \
        .execute()

    return HTMLResponse(
        content="""
        <html>
        <body style="font-family:Inter,sans-serif;background:#0A0E13;color:#F1EFE8;
                     display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
          <div style="text-align:center;max-width:400px">
            <h2>Unsubscribed</h2>
            <p style="color:#888">You won't receive daily watchlist digest emails anymore.</p>
            <p style="color:#888;font-size:13px">You can re-enable this in Settings → Notifications.</p>
          </div>
        </body>
        </html>
        """,
        status_code=200,
    )
