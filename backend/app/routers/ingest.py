from datetime import date as DateType

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel

from app.services.bhavcopy import download_and_ingest
from app.services.supabase import settings

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
