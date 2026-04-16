import logging
from datetime import date

import pytz
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import alerts, charts, ingest, journal, options, scanner, stocks, users, waitlist, watchlist

try:
    from app.routers import payments as payments_router
    _payments_available = True
except ImportError:
    _payments_available = False

try:
    from app.routers import ai as ai_router
    _ai_available = True
except ImportError:
    _ai_available = False
from app.services.supabase import settings

logger = logging.getLogger(__name__)

app = FastAPI(title="AlphaVyuh API", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        settings.frontend_url,
        "https://alphavyuh.vercel.app",
        "https://alphavyuh.in",
    ],
    # Covers all *.vercel.app preview + production deployments
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router)
app.include_router(waitlist.router)
app.include_router(ingest.router)
app.include_router(scanner.router)
app.include_router(alerts.router)
app.include_router(options.router)
app.include_router(watchlist.router)
app.include_router(stocks.router)
app.include_router(charts.router)
app.include_router(journal.router)
if _payments_available:
    app.include_router(payments_router.router)
if _ai_available:
    app.include_router(ai_router.router)

_scheduler: AsyncIOScheduler | None = None


async def _trigger_daily_ingest():
    try:
        from app.services.bhavcopy import download_and_ingest
        result = await download_and_ingest(date.today())
        logger.info(f"Scheduled ingest: {result}")
    except Exception as e:
        logger.error(f"Scheduled ingest failed: {e}")
        return

    # After ingest succeeds, run all saved scan alerts
    try:
        alert_result = await alerts.run_all_alerts(date.today())
        logger.info(f"Scan alerts run: {alert_result}")
    except Exception as e:
        logger.error(f"Scan alerts run failed: {e}")


@app.on_event("startup")
async def start_scheduler():
    global _scheduler
    ist = pytz.timezone("Asia/Kolkata")
    _scheduler = AsyncIOScheduler(timezone=ist)
    _scheduler.add_job(
        _trigger_daily_ingest,
        CronTrigger(hour=16, minute=0, timezone=ist),
        id="daily_bhavcopy",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info("APScheduler started — daily ingest at 16:00 IST")


@app.on_event("shutdown")
async def stop_scheduler():
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.3.0"}
