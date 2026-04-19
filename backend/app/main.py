import logging
from datetime import date

import pytz
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import alerts, backtest as backtest_router, broker, charts, community as community_router, ingest, journal, market as market_router, options, price_alerts as price_alerts_router, scanner, stocks, users, waitlist, watchlist

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
        "https://alphavyuh.com",
        "https://www.alphavyuh.com",
    ],
    # Covers all *.vercel.app preview + production deployments
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router)
app.include_router(waitlist.router)
app.include_router(backtest_router.router)
app.include_router(community_router.router)
app.include_router(broker.router)
app.include_router(ingest.router)
app.include_router(scanner.router)
app.include_router(alerts.router)
app.include_router(options.router)
app.include_router(watchlist.router)
app.include_router(stocks.router)
app.include_router(charts.router)
app.include_router(market_router.router)
app.include_router(journal.router)
app.include_router(price_alerts_router.router)
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


async def _trigger_yfinance_refresh():
    """
    Runs at 4:15 PM IST weekdays — 15 min after NSE close.
    Pulls last 5 days from Yahoo Finance so charts always show fresh data.
    """
    import asyncio as _asyncio
    try:
        from app.services.yfinance_ingest import fetch_and_ingest, NSE_UNIVERSE
        success = 0
        for sym in NSE_UNIVERSE[:200]:
            try:
                r = fetch_and_ingest(sym, period="5d")
                if r.get("status") == "success":
                    success += 1
            except Exception as e:
                logger.warning("yfinance refresh failed for %s: %s", sym, e)
            await _asyncio.sleep(0.25)
        logger.info("Daily yfinance refresh complete: %d/200 updated", success)
    except Exception as e:
        logger.error("Daily yfinance refresh error: %s", e)


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
    _scheduler.add_job(
        _trigger_yfinance_refresh,
        CronTrigger(hour=16, minute=15, day_of_week="mon-fri", timezone=ist),
        id="daily_yfinance_refresh",
        replace_existing=True,
    )
    _scheduler.add_job(
        price_alerts_router.check_price_alerts,
        "interval",
        minutes=5,
        id="price_alert_check",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info("APScheduler started — bhavcopy 16:00, yfinance refresh 16:15, price alerts every 5 min")


@app.on_event("shutdown")
async def stop_scheduler():
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.3.0"}
