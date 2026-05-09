import asyncio
import logging
from datetime import date as DateType

from fastapi import APIRouter, Header, HTTPException, Query, status
from pydantic import BaseModel

from app.services.bhavcopy import download_and_ingest
from app.services.supabase import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/ingest", tags=["ingest"])


class IngestRequest(BaseModel):
    trade_date: DateType | None = None


@router.post("/bhavcopy")
async def ingest_bhavcopy(
    body: IngestRequest = IngestRequest(),
    x_service_key: str | None = Header(default=None),
):
    if not settings.ingest_service_key or x_service_key != settings.ingest_service_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid service key")

    target_date = body.trade_date or DateType.today()
    result = await download_and_ingest(target_date)
    return result


@router.post("/refresh-today")
async def refresh_today(
    limit: int = Query(default=200, ge=1, le=500),
    x_service_key: str | None = Header(default=None),
):
    """
    Pull last 5 days of OHLCV data from Yahoo Finance for NSE stocks and
    upsert into daily_ohlcv. Safe to call multiple times (idempotent).
    Protected by INGEST_SERVICE_KEY header.
    """
    if not settings.ingest_service_key or x_service_key != settings.ingest_service_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid service key")

    from app.services.yfinance_ingest import fetch_and_ingest, NSE_UNIVERSE

    symbols = NSE_UNIVERSE[:limit]
    success = 0
    errors = 0

    for sym in symbols:
        try:
            result = fetch_and_ingest(sym, period="5d")
            if result.get("status") == "success":
                success += 1
            else:
                errors += 1
        except Exception as e:
            logger.warning("refresh-today failed for %s: %s", sym, e)
            errors += 1
        await asyncio.sleep(0.25)   # stay under Yahoo rate limit

    return {
        "refreshed": success,
        "errors": errors,
        "total": len(symbols),
        "message": f"Updated {success}/{len(symbols)} stocks from Yahoo Finance",
    }
