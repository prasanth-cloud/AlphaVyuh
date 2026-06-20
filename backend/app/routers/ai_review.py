import json
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from app.middleware.auth import get_current_user_id
from app.services.plans import get_effective_user_plan
from app.services.supabase import get_admin_client

router = APIRouter(prefix="/api/v1/journal", tags=["ai-review"])

MIN_TRADES = 5
CACHE_HOURS = 24
MAX_TRADES = 30


def _get_user_plan(user_id: str) -> str:
    sb = get_admin_client()
    return get_effective_user_plan(sb, user_id)


@router.get("/ai-review")
def get_ai_review(user_id: str = Depends(get_current_user_id)):
    plan = _get_user_plan(user_id)
    if plan == "free":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "pro_required"},
        )

    sb = get_admin_client()

    count_resp = (
        sb.table("trade_journal")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .execute()
    )
    trade_count = count_resp.count or 0
    if trade_count < MIN_TRADES:
        return {"status": "insufficient_data", "trades_needed": MIN_TRADES - trade_count}

    cutoff = (datetime.now(timezone.utc) - timedelta(hours=CACHE_HOURS)).isoformat()
    cached = (
        sb.table("journal_ai_reviews")
        .select("result, created_at")
        .eq("user_id", user_id)
        .gte("created_at", cutoff)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if cached.data:
        return {"status": "ok", **cached.data[0]["result"]}

    trades_resp = (
        sb.table("trade_journal")
        .select("symbol, trade_type, entry_date, entry_price, exit_price, quantity, pnl, setup_type, entry_reason")
        .eq("user_id", user_id)
        .order("entry_date", desc=True)
        .limit(MAX_TRADES)
        .execute()
    )
    trades = trades_resp.data or []

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI review service unavailable",
        )

    import anthropic

    client = anthropic.Anthropic(api_key=api_key)
    msg = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1000,
        system=(
            "You are a trading journal analyst. Identify objective patterns in "
            "historical trade data only. Never give investment advice or tell the "
            "trader what to do next. Return only valid JSON, no markdown."
        ),
        messages=[
            {
                "role": "user",
                "content": (
                    f"Analyze {len(trades)} trades. Return JSON with exactly three "
                    "arrays — winning_patterns, mistake_patterns, sizing_observations "
                    "— max 4 strings each. Describe only past observations. Never use "
                    f"'you should', 'consider', 'recommend'. Trades: {json.dumps(trades)}"
                ),
            }
        ],
    )
    result = json.loads(msg.content[0].text)

    sb.table("journal_ai_reviews").insert(
        {"user_id": user_id, "result": result}
    ).execute()

    return {"status": "ok", **result}
