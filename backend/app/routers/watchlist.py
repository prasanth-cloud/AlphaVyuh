from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.middleware.auth import get_current_user_id
from app.services.supabase import get_admin_client

router = APIRouter(prefix="/api/v1/watchlists", tags=["watchlists"])

FREE_WATCHLIST_LIMIT = 1
FREE_ITEMS_LIMIT = 20
PRO_WATCHLIST_LIMIT = 10
PRO_ITEMS_LIMIT = 200


def _get_user_plan(user_id: str) -> str:
    client = get_admin_client()
    result = client.table("users").select("plan").eq("id", user_id).single().execute()
    return result.data["plan"] if result.data else "free"


def _verify_watchlist_ownership(client, watchlist_id: str, user_id: str):
    result = client.table("watchlists").select("id").eq("id", watchlist_id).eq("user_id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Watchlist not found")


def _enrich_items(client, items: list) -> list:
    """Join watchlist items with latest OHLCV data."""
    if not items:
        return []

    symbols = [i["symbol"] for i in items]

    # Get latest trade date
    date_res = client.table("daily_ohlcv").select("trade_date").order("trade_date", desc=True).limit(1).execute()
    if not date_res.data:
        return [{**item, "close": None, "pct_change": None, "volume_ratio": None, "rsi_14": None} for item in items]

    latest_date = date_res.data[0]["trade_date"]

    # Fetch quotes for all symbols
    quotes_res = client.table("daily_ohlcv") \
        .select("symbol, close, prev_close, volume, avg_volume_20d, rsi_14, stock_universe(company_name, sector)") \
        .eq("trade_date", latest_date) \
        .in_("symbol", symbols) \
        .execute()

    quote_map = {}
    for q in (quotes_res.data or []):
        su = q.get("stock_universe") or {}
        if isinstance(su, list):
            su = su[0] if su else {}
        close = float(q["close"] or 0)
        prev = float(q["prev_close"] or 0)
        vol = int(q["volume"] or 0)
        avg_vol = int(q["avg_volume_20d"] or 0)
        quote_map[q["symbol"]] = {
            "company_name": su.get("company_name"),
            "sector": su.get("sector"),
            "close": close,
            "pct_change": round((close - prev) / prev * 100, 2) if prev else None,
            "volume_ratio": round(vol / avg_vol, 2) if avg_vol else None,
            "rsi_14": float(q["rsi_14"]) if q["rsi_14"] is not None else None,
        }

    enriched = []
    for item in items:
        q = quote_map.get(item["symbol"], {})
        enriched.append({**item, **q})
    return enriched


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("")
async def get_watchlists(user_id: str = Depends(get_current_user_id)):
    client = get_admin_client()

    # 1 – all watchlists
    wl_res = client.table("watchlists") \
        .select("id, name, sort_order, created_at") \
        .eq("user_id", user_id) \
        .order("sort_order") \
        .execute()
    watchlists = wl_res.data or []
    if not watchlists:
        return {"watchlists": []}

    wl_ids = [wl["id"] for wl in watchlists]

    # 2 – all items across all watchlists in ONE query
    items_res = client.table("watchlist_items") \
        .select("watchlist_id, symbol, sort_order, added_at") \
        .in_("watchlist_id", wl_ids) \
        .order("sort_order") \
        .execute()
    all_items = items_res.data or []

    # 3 – latest trade date (once)
    quote_map: dict = {}
    all_symbols = list({item["symbol"] for item in all_items})
    if all_symbols:
        date_res = client.table("daily_ohlcv") \
            .select("trade_date").order("trade_date", desc=True).limit(1).execute()
        if date_res.data:
            latest_date = date_res.data[0]["trade_date"]
            # 4 – quotes for ALL symbols in ONE query
            quotes_res = client.table("daily_ohlcv") \
                .select("symbol, close, prev_close, volume, avg_volume_20d, rsi_14,"
                        "stock_universe(company_name, sector)") \
                .eq("trade_date", latest_date) \
                .in_("symbol", all_symbols) \
                .execute()
            for q in (quotes_res.data or []):
                su = q.get("stock_universe") or {}
                if isinstance(su, list):
                    su = su[0] if su else {}
                close = float(q["close"] or 0)
                prev  = float(q["prev_close"] or 0)
                vol   = int(q["volume"] or 0)
                avg   = int(q["avg_volume_20d"] or 0)
                quote_map[q["symbol"]] = {
                    "company_name": su.get("company_name"),
                    "sector":       su.get("sector"),
                    "close":        close,
                    "pct_change":   round((close - prev) / prev * 100, 2) if prev else None,
                    "volume_ratio": round(vol / avg, 2) if avg else None,
                    "rsi_14":       float(q["rsi_14"]) if q["rsi_14"] is not None else None,
                }

    # group items by watchlist_id and merge quotes
    items_by_wl: dict = {}
    for item in all_items:
        wid = item["watchlist_id"]
        items_by_wl.setdefault(wid, []).append({**item, **quote_map.get(item["symbol"], {})})

    for wl in watchlists:
        wl["items"] = items_by_wl.get(wl["id"], [])

    return {"watchlists": watchlists}


class CreateWatchlistRequest(BaseModel):
    name: str = "My Watchlist"


@router.post("")
async def create_watchlist(body: CreateWatchlistRequest, user_id: str = Depends(get_current_user_id)):
    client = get_admin_client()
    plan = _get_user_plan(user_id)
    limit = FREE_WATCHLIST_LIMIT if plan == "free" else PRO_WATCHLIST_LIMIT

    count_res = client.table("watchlists").select("id", count="exact").eq("user_id", user_id).execute()
    if (count_res.count or 0) >= limit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Plan limit: max {limit} watchlist(s)"
        )

    result = client.table("watchlists").insert({"user_id": user_id, "name": body.name}).execute()
    return result.data[0]


class AddItemRequest(BaseModel):
    symbol: str


@router.post("/{watchlist_id}/items")
async def add_item(
    watchlist_id: UUID,
    body: AddItemRequest,
    user_id: str = Depends(get_current_user_id),
):
    client = get_admin_client()
    _verify_watchlist_ownership(client, str(watchlist_id), user_id)

    plan = _get_user_plan(user_id)
    item_limit = FREE_ITEMS_LIMIT if plan == "free" else PRO_ITEMS_LIMIT

    count_res = client.table("watchlist_items") \
        .select("id", count="exact") \
        .eq("watchlist_id", str(watchlist_id)) \
        .execute()
    if (count_res.count or 0) >= item_limit:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Plan limit: max {item_limit} items")

    # Verify symbol exists
    sym_res = client.table("stock_universe").select("symbol").eq("symbol", body.symbol.upper()).execute()
    if not sym_res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Symbol not found")

    try:
        client.table("watchlist_items").insert({
            "watchlist_id": str(watchlist_id),
            "symbol": body.symbol.upper(),
        }).execute()
    except Exception as e:
        if "duplicate" in str(e).lower() or "23505" in str(e):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Symbol already in watchlist")
        raise
    return {"message": "Added"}


@router.delete("/{watchlist_id}/items/{symbol}")
async def remove_item(
    watchlist_id: UUID,
    symbol: str,
    user_id: str = Depends(get_current_user_id),
):
    client = get_admin_client()
    _verify_watchlist_ownership(client, str(watchlist_id), user_id)
    client.table("watchlist_items") \
        .delete() \
        .eq("watchlist_id", str(watchlist_id)) \
        .eq("symbol", symbol.upper()) \
        .execute()
    return {"message": "Removed"}


class ReorderItem(BaseModel):
    symbol: str
    sort_order: int


class ReorderRequest(BaseModel):
    items: list[ReorderItem]


@router.patch("/{watchlist_id}/items/reorder")
async def reorder_items(
    watchlist_id: UUID,
    body: ReorderRequest,
    user_id: str = Depends(get_current_user_id),
):
    client = get_admin_client()
    _verify_watchlist_ownership(client, str(watchlist_id), user_id)
    for item in body.items:
        client.table("watchlist_items") \
            .update({"sort_order": item.sort_order}) \
            .eq("watchlist_id", str(watchlist_id)) \
            .eq("symbol", item.symbol.upper()) \
            .execute()
    return {"message": "Reordered"}
