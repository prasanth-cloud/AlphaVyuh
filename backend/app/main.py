import logging
import os
from datetime import date

import pytz
import sentry_sdk
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN"),
    traces_sample_rate=0.1,
    environment=os.getenv("RAILWAY_ENVIRONMENT", "development"),
    integrations=[FastApiIntegration(), StarletteIntegration()],
)

from app.routers import admin as admin_router, alerts, backtest as backtest_router, broker, brokers as brokers_router, charts, community as community_router, data_health as data_health_router, email_digest as email_digest_router, feedback as feedback_router, ingest, journal, market as market_router, options, price_alerts as price_alerts_router, scanner, stocks, users, waitlist, watchlist, workflow

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

if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=os.environ.get("RAILWAY_ENVIRONMENT", "development"),
        traces_sample_rate=0.1 if os.environ.get("RAILWAY_ENVIRONMENT") == "production" else 1.0,
        send_default_pii=False,
        enable_tracing=True,
    )

app = FastAPI(title="AlphaVyuh API", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
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

app.include_router(admin_router.router)
app.include_router(users.router)
app.include_router(waitlist.router)
app.include_router(backtest_router.router)
app.include_router(community_router.router)
app.include_router(broker.router)
app.include_router(brokers_router.router)
app.include_router(ingest.router)
app.include_router(scanner.router)
app.include_router(alerts.router)
app.include_router(options.router)
app.include_router(watchlist.router)
app.include_router(workflow.router)
app.include_router(stocks.router)
app.include_router(charts.router)
app.include_router(market_router.router)
app.include_router(journal.router)
app.include_router(price_alerts_router.router)
app.include_router(data_health_router.router)
app.include_router(feedback_router.router)
app.include_router(email_digest_router.router)
if _payments_available:
    app.include_router(payments_router.router)
if _ai_available:
    app.include_router(ai_router.router)

_scheduler: AsyncIOScheduler | None = None


def _bhavcopy_result_supports_alerts(result: dict | None) -> bool:
    if not result:
        return False
    status = result.get("status")
    rows = int(result.get("rows_ingested") or 0)
    return (
        status in {"success", "already_done"}
        and result.get("partial_ingest") is not True
        and rows > 0
    )


async def _trigger_daily_ingest():
    target = date.today()
    try:
        from app.services.bhavcopy import download_and_ingest
        result = await download_and_ingest(target)
        logger.info(f"Scheduled ingest: {result}")
    except Exception as e:
        logger.error(f"Scheduled ingest failed: {e}")
        return

    if not _bhavcopy_result_supports_alerts(result):
        logger.info("Scan alerts skipped after scheduled ingest: %s", result)
        return

    # After trusted ingest succeeds, run all saved scan alerts.
    try:
        alert_result = await alerts.run_all_alerts(target)
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
    if settings.enable_yfinance_refresh:
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
    from app.services.kite_token_refresh import refresh_kite_tokens
    _scheduler.add_job(
        refresh_kite_tokens,
        CronTrigger(hour=6, minute=30, timezone=ist),
        id="kite_token_refresh",
        replace_existing=True,
    )
    from app.services.email_digest import send_daily_digests
    _scheduler.add_job(
        send_daily_digests,
        CronTrigger(hour=18, minute=30, day_of_week="mon-fri", timezone=ist),
        id="daily_email_digest",
        replace_existing=True,
    )
    from app.services.broker_key_rotation import quarterly_rotation_check
    _scheduler.add_job(
        quarterly_rotation_check,
        CronTrigger(month="1,4,7,10", day=1, hour=2, minute=0, timezone=ist),
        id="quarterly_broker_key_rotation",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info(
        "APScheduler started — bhavcopy 16:00, yfinance refresh %s, email digest 18:30, price alerts every 5 min, kite token 06:30, broker key rotation quarterly",
        "enabled at 16:15" if settings.enable_yfinance_refresh else "disabled",
    )


@app.on_event("shutdown")
async def stop_scheduler():
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)


@app.get("/health")
@app.get("/healthz")
async def health():
    return {"status": "ok", "version": "0.3.1"}


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}
