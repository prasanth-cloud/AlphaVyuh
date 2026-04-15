from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.middleware.auth import get_current_user_id
from app.services.supabase import get_admin_client

router = APIRouter(prefix="/api/v1/journal", tags=["journal"])


# ── Models ────────────────────────────────────────────────────────────────────

class JournalEntry(BaseModel):
    symbol: str
    trade_type: str                     # 'long' or 'short'
    entry_date: str                     # YYYY-MM-DD
    entry_price: float
    quantity: int
    setup_type: Optional[str] = None   # breakout, pullback, reversal, momentum, other
    stop_loss: Optional[float] = None
    target_price: Optional[float] = None
    entry_reason: Optional[str] = None


class JournalUpdate(BaseModel):
    exit_date: Optional[str] = None
    exit_price: Optional[float] = None
    exit_reason: Optional[str] = None
    mistakes: Optional[str] = None
    lessons: Optional[str] = None
    stop_loss: Optional[float] = None
    target_price: Optional[float] = None
    setup_type: Optional[str] = None
    entry_reason: Optional[str] = None
    status: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _compute_pnl(entry_price: float, exit_price: float, quantity: int, trade_type: str):
    if trade_type == "long":
        pnl = (exit_price - entry_price) * quantity
    else:
        pnl = (entry_price - exit_price) * quantity
    pnl_pct = (pnl / (entry_price * quantity)) * 100
    return round(pnl, 2), round(pnl_pct, 4)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_stats(user_id: str = Depends(get_current_user_id)):
    sb = get_admin_client()
    result = (
        sb.table("trade_journal")
        .select("pnl,pnl_pct,status,trade_type,setup_type,holding_days")
        .eq("user_id", user_id)
        .eq("status", "closed")
        .execute()
    )
    entries = result.data or []

    open_r = (
        sb.table("trade_journal")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .eq("status", "open")
        .execute()
    )
    open_count = open_r.count or 0

    if not entries:
        return {
            "total_trades": 0,
            "open_trades": open_count,
            "total_pnl": 0,
            "win_rate": 0,
            "avg_pnl": 0,
            "avg_win": 0,
            "avg_loss": 0,
            "best_trade": 0,
            "worst_trade": 0,
            "avg_holding_days": 0,
        }

    pnls = [float(e["pnl"]) for e in entries if e.get("pnl") is not None]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p < 0]
    holding = [e["holding_days"] for e in entries if e.get("holding_days") is not None]

    return {
        "total_trades": len(entries),
        "open_trades": open_count,
        "total_pnl": round(sum(pnls), 2),
        "win_rate": round(len(wins) / len(pnls) * 100, 1) if pnls else 0,
        "avg_pnl": round(sum(pnls) / len(pnls), 2) if pnls else 0,
        "avg_win": round(sum(wins) / len(wins), 2) if wins else 0,
        "avg_loss": round(sum(losses) / len(losses), 2) if losses else 0,
        "best_trade": round(max(pnls), 2) if pnls else 0,
        "worst_trade": round(min(pnls), 2) if pnls else 0,
        "avg_holding_days": round(sum(holding) / len(holding), 1) if holding else 0,
    }


@router.get("")
async def list_entries(
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    status: Optional[str] = None,
    symbol: Optional[str] = None,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_admin_client()
    q = (
        sb.table("trade_journal")
        .select("*")
        .eq("user_id", user_id)
        .order("entry_date", desc=True)
        .range(offset, offset + limit - 1)
    )
    if status:
        q = q.eq("status", status)
    if symbol:
        q = q.eq("symbol", symbol.upper())

    result = q.execute()
    return {"entries": result.data or [], "total": len(result.data or [])}


@router.post("")
async def create_entry(
    body: JournalEntry,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_admin_client()

    # Lookup company name
    stock = (
        sb.table("stock_universe")
        .select("company_name")
        .eq("symbol", body.symbol.upper())
        .execute()
    )
    company_name = stock.data[0]["company_name"] if stock.data else body.symbol.upper()

    # Compute R:R if stop and target provided
    risk_reward = None
    if body.stop_loss and body.target_price and body.entry_price:
        if body.trade_type == "long":
            risk = body.entry_price - body.stop_loss
            reward = body.target_price - body.entry_price
        else:
            risk = body.stop_loss - body.entry_price
            reward = body.entry_price - body.target_price
        if risk > 0:
            risk_reward = round(reward / risk, 2)

    row = {
        "user_id": user_id,
        "symbol": body.symbol.upper(),
        "company_name": company_name,
        "trade_type": body.trade_type,
        "entry_date": body.entry_date,
        "entry_price": body.entry_price,
        "quantity": body.quantity,
        "setup_type": body.setup_type,
        "stop_loss": body.stop_loss,
        "target_price": body.target_price,
        "risk_reward": risk_reward,
        "entry_reason": body.entry_reason,
        "status": "open",
    }
    result = sb.table("trade_journal").insert(row).execute()
    return result.data[0]


@router.patch("/{entry_id}")
async def update_entry(
    entry_id: str,
    body: JournalUpdate,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_admin_client()

    existing = (
        sb.table("trade_journal")
        .select("*")
        .eq("id", entry_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Entry not found")

    entry = existing.data
    update_data = {k: v for k, v in body.model_dump().items() if v is not None}

    # Compute P&L when closing
    if body.exit_price and body.exit_date:
        pnl, pnl_pct = _compute_pnl(
            float(entry["entry_price"]),
            body.exit_price,
            int(entry["quantity"]),
            entry["trade_type"],
        )
        update_data["pnl"] = pnl
        update_data["pnl_pct"] = pnl_pct
        update_data["status"] = "closed"

        entry_d = date.fromisoformat(entry["entry_date"])
        exit_d = date.fromisoformat(body.exit_date)
        update_data["holding_days"] = (exit_d - entry_d).days

    result = sb.table("trade_journal").update(update_data).eq("id", entry_id).execute()
    return result.data[0]


@router.delete("/{entry_id}")
async def delete_entry(
    entry_id: str,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_admin_client()
    sb.table("trade_journal").delete().eq("id", entry_id).eq("user_id", user_id).execute()
    return {"message": "Deleted"}
