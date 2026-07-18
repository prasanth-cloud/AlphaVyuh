"""
Precomputed market breadth snapshots for the dashboard.

Data source: NSE bhavcopy ingested into Supabase `daily_ohlcv` (see `app/services/bhavcopy.py`).
Indices on the tape may use Kite live quotes; breadth, gainers/losers, sectors, and EMA counts
are always computed from the latest *complete* NSE EQ EOD session, not mock or stale partial ingests.

The dashboard should not recompute all-market breadth during cold page load.
This service builds the same overview payload from daily_ohlcv after ingest
and stores it in the existing ingest_runs table under a stable run_id. That
keeps the read path compact without adding launch-blocking schema churn.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timezone
from typing import Any

from app.services.market_dates import analyze_trade_date_quality
from app.services.market_context import eod_source_metadata
from app.services.market_universe_contract import MARKET_UNIVERSE_CONTRACT
from app.services.sector_taxonomy import build_sector_taxonomy_metadata

SNAPSHOT_RUN_ID_PREFIX = "market-breadth-snapshot"
MAX_SNAPSHOT_UNCHANGED_RATIO = 0.85
MIN_SNAPSHOT_MOVING_RATIO = 0.08
MIN_SNAPSHOT_QUALITY_ROWS = 500
EMA_BREADTH_HISTORY_DAYS = 15


def _f(value: Any, default=None):
    try:
        return float(value) if value is not None else default
    except (TypeError, ValueError):
        return default


def _mover(row: dict) -> dict:
    return {
        "symbol": row["symbol"],
        "company_name": row["company_name"],
        "close": row["close"],
        "pct_change": row["pct_change"],
        "volume_ratio": row["volume_ratio"],
    }


def _active_universe_count(client) -> int | None:
    try:
        result = (
            client.table("stock_universe")
            .select("symbol", count="exact")
            .eq("series", "EQ")
            .eq("market", "NSE")
            .eq("is_active", True)
            .limit(1)
            .execute()
        )
        return result.count
    except Exception:
        return None


def _fetch_daily_rows(client, trade_date: str, *, max_rows: int = 10000) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    page_size = 1000
    select_clause = (
        "symbol,close,prev_close,open,high,low,volume,avg_volume_20d,"
        "week_52_high,week_52_low,rsi_14,ema_20,ema_50,ema_200,atr_14,pct_change,"
        "is_new_52w_high,is_new_52w_low,"
        "stock_universe!daily_ohlcv_symbol_fkey!inner(symbol,company_name,series,sector,market,is_active)"
    )
    while len(rows) < max_rows:
        chunk = (
            client.table("daily_ohlcv")
            .select(select_clause)
            .eq("trade_date", trade_date)
            .range(offset, offset + page_size - 1)
            .execute()
            .data or []
        )
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < page_size:
            break
        offset += page_size
    return rows


def _filter_nse_eq_rows(rows: list[dict]) -> list[dict]:
    return [
        row for row in rows
        if (row.get("stock_universe") or {}).get("series") == "EQ"
        and (row.get("stock_universe") or {}).get("market") == "NSE"
        and (row.get("stock_universe") or {}).get("is_active", True)
    ]


def _list_recent_trade_dates(client, end_date: str, *, limit: int = 260) -> list[str]:
    rows: list[dict] = []
    offset = 0
    page_size = min(1000, limit)
    while len(rows) < limit:
        chunk = (
            client.table("daily_ohlcv")
            .select("trade_date")
            .lte("trade_date", end_date)
            .order("trade_date", desc=True)
            .range(offset, offset + page_size - 1)
            .execute()
            .data or []
        )
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < page_size:
            break
        offset += page_size
    seen: set[str] = set()
    ordered: list[str] = []
    for row in rows:
        trade_date = row.get("trade_date")
        if not trade_date or trade_date in seen:
            continue
        seen.add(trade_date)
        ordered.append(str(trade_date))
        if len(ordered) >= limit:
            break
    return ordered


def _enrich_breadth_rows(rows: list[dict]) -> list[dict]:
    enriched: list[dict] = []
    for row in rows:
        universe_row = row.get("stock_universe") or {}
        close = _f(row.get("close"), None)
        prev_close = _f(row.get("prev_close"), None)
        stored_pct_change = _f(row.get("pct_change"), None)
        if not close or close <= 0:
            continue

        volume = int(row.get("volume") or 0)
        avg_volume = int(row.get("avg_volume_20d") or 0)
        if prev_close and prev_close > 0:
            pct_change = round((close - prev_close) / prev_close * 100, 2)
        elif stored_pct_change is not None:
            pct_change = round(stored_pct_change, 2)
        else:
            continue
        volume_ratio = round(volume / avg_volume, 2) if avg_volume else None
        week_52_high = _f(row.get("week_52_high"), None)
        week_52_low = _f(row.get("week_52_low"), None)
        week_52_high_pct = round((week_52_high - close) / close * 100, 2) if week_52_high and close else None
        stored_new_high = row.get("is_new_52w_high")
        stored_new_low = row.get("is_new_52w_low")

        enriched.append({
            "symbol": row["symbol"],
            "company_name": universe_row.get("company_name") or None,
            "sector": universe_row.get("sector"),
            "close": close,
            "pct_change": pct_change,
            "volume": volume,
            "avg_volume_20d": avg_volume,
            "volume_ratio": volume_ratio,
            "ema_20": _f(row.get("ema_20"), None),
            "ema_50": _f(row.get("ema_50"), None),
            "ema_200": _f(row.get("ema_200"), None),
            "week_52_high": week_52_high,
            "week_52_high_pct": week_52_high_pct,
            "is_new_52w_high": (
                bool(stored_new_high)
                if stored_new_high is not None
                else bool(week_52_high and close and close >= week_52_high * 0.995)
            ),
            "is_new_52w_low": (
                bool(stored_new_low)
                if stored_new_low is not None
                else bool(week_52_low and close and close <= week_52_low * 1.005)
            ),
        })
    return enriched


def _ema_breadth_pct(enriched: list[dict]) -> dict[str, float]:
    valid_ema20 = sum(1 for row in enriched if row["ema_20"])
    valid_ema50 = sum(1 for row in enriched if row["ema_50"])
    valid_ema200 = sum(1 for row in enriched if row["ema_200"])
    above_ema20 = sum(1 for row in enriched if row["ema_20"] and row["close"] > row["ema_20"])
    above_ema50 = sum(1 for row in enriched if row["ema_50"] and row["close"] > row["ema_50"])
    above_ema200 = sum(1 for row in enriched if row["ema_200"] and row["close"] > row["ema_200"])

    def pct(count: int, denominator: int) -> float:
        return round(count / denominator * 100, 1) if denominator else 0

    return {
        "ema20": pct(above_ema20, valid_ema20),
        "ema50": pct(above_ema50, valid_ema50),
        "ema200": pct(above_ema200, valid_ema200),
    }


def _highs_lows_counts(enriched: list[dict]) -> dict[str, int]:
    new_highs = sum(1 for row in enriched if row["is_new_52w_high"])
    new_lows = sum(1 for row in enriched if row["is_new_52w_low"])
    if new_highs == 0:
        new_highs = sum(
            1 for row in enriched
            if row.get("week_52_high_pct") is not None and row["week_52_high_pct"] <= 0.5
        )
    return {"highs": new_highs, "lows": new_lows}


def _ema_breadth_point(client, trade_date: str) -> dict | None:
    rows = _filter_nse_eq_rows(_fetch_daily_rows(client, trade_date))
    enriched = _enrich_breadth_rows(rows)
    if not enriched:
        return None
    breadth = _ema_breadth_pct(enriched)
    return {
        "trade_date": trade_date,
        "ema20": breadth["ema20"],
        "ema50": breadth["ema50"],
        "ema200": breadth["ema200"],
    }


def _build_ema_breadth_daily_history(
    client,
    trade_dates: list[str],
    *,
    limit: int = EMA_BREADTH_HISTORY_DAYS,
) -> list[dict]:
    history: list[dict] = []
    for trade_date in trade_dates[:limit]:
        point = _ema_breadth_point(client, trade_date)
        if point:
            history.append(point)
    return history


def _build_ema_breadth_lookback_history(client, trade_dates: list[str]) -> dict[str, list[dict]]:
    lookback_steps = {
        "day": (7, 1),
        "week": (7, 5),
        "month": (7, 21),
        "year": (7, 251),
    }
    history: dict[str, list[dict]] = {}
    for granularity, (count, step) in lookback_steps.items():
        points: list[dict] = []
        for index in range(count):
            offset = index * step
            if offset >= len(trade_dates):
                break
            point = _ema_breadth_point(client, trade_dates[offset])
            if point:
                points.append(point)
        history[granularity] = points
    return history


def _build_period_views(client, latest_date: str, daily_enriched: list[dict]) -> tuple[dict, dict, list[dict], dict[str, list[dict]]]:
    trade_dates = _list_recent_trade_dates(client, latest_date)
    period_offsets = {"day": 0, "week": 4, "month": 21, "year": 251}
    ema_by_period: dict[str, dict[str, float] | None] = {}

    for period, offset in period_offsets.items():
        if offset >= len(trade_dates):
            ema_by_period[period] = None
            continue
        if period == "day":
            ema_by_period[period] = _ema_breadth_pct(daily_enriched)
            continue
        rows = _filter_nse_eq_rows(_fetch_daily_rows(client, trade_dates[offset]))
        enriched = _enrich_breadth_rows(rows)
        ema_by_period[period] = _ema_breadth_pct(enriched) if enriched else None

    daily_counts = _highs_lows_counts(daily_enriched)
    weekly_highs = 0
    weekly_lows = 0
    for trade_date in trade_dates[:5]:
        rows = _filter_nse_eq_rows(_fetch_daily_rows(client, trade_date))
        enriched = _enrich_breadth_rows(rows)
        counts = _highs_lows_counts(enriched)
        weekly_highs += counts["highs"]
        weekly_lows += counts["lows"]

    highs_lows_by_period = {
        "daily": daily_counts,
        "weekly": {"highs": weekly_highs, "lows": weekly_lows},
    }
    ema_breadth_daily_history = _build_ema_breadth_daily_history(client, trade_dates)
    ema_breadth_lookback = _build_ema_breadth_lookback_history(client, trade_dates)
    return ema_by_period, highs_lows_by_period, ema_breadth_daily_history, ema_breadth_lookback


def _snapshot_quality_error(overview: dict) -> str | None:
    total = int(overview.get("total") or overview.get("total_stocks") or 0)
    advances = int(overview.get("advances") or 0)
    declines = int(overview.get("declines") or 0)
    unchanged = int(overview.get("unchanged") or 0)
    if total < MIN_SNAPSHOT_QUALITY_ROWS:
        return None
    moving = advances + declines
    unchanged_ratio = unchanged / total if total else 0
    moving_ratio = moving / total if total else 0
    if unchanged_ratio >= MAX_SNAPSHOT_UNCHANGED_RATIO and moving_ratio < MIN_SNAPSHOT_MOVING_RATIO:
        return (
            "market breadth distribution is implausibly flat: "
            f"advances={advances}, declines={declines}, unchanged={unchanged}, total={total}"
        )
    return None


def _assert_snapshot_quality(overview: dict) -> None:
    quality_error = _snapshot_quality_error(overview)
    if quality_error:
        raise ValueError(quality_error)


def build_market_breadth_snapshot(
    client,
    trade_date: str | date,
    indices: list[dict] | None = None,
    quote_source: str = "latest_complete_session",
    indices_live: bool = False,
    cache_status: str = "snapshot_build",
) -> dict:
    latest_date = str(trade_date)
    universe_active = _active_universe_count(client)
    rows = _filter_nse_eq_rows(_fetch_daily_rows(client, latest_date))

    raw_quality = analyze_trade_date_quality(rows)
    if raw_quality["is_suspicious"]:
        raise ValueError("; ".join(raw_quality["reasons"]))

    enriched = _enrich_breadth_rows(rows)

    total = len(enriched)
    advances = sum(1 for row in enriched if row["pct_change"] > 0.05)
    declines = sum(1 for row in enriched if row["pct_change"] < -0.05)
    unchanged = total - advances - declines
    daily_counts = _highs_lows_counts(enriched)
    new_highs = daily_counts["highs"]
    new_lows = daily_counts["lows"]
    advance_decline_ratio = round(advances / declines, 2) if declines else float(advances)

    ema_breadth = _ema_breadth_pct(enriched)
    above_ema20_pct = ema_breadth["ema20"]
    above_ema50_pct = ema_breadth["ema50"]
    above_ema200_pct = ema_breadth["ema200"]
    above_ema20 = sum(1 for row in enriched if row["ema_20"] and row["close"] > row["ema_20"])
    above_ema50 = sum(1 for row in enriched if row["ema_50"] and row["close"] > row["ema_50"])
    above_ema200 = sum(1 for row in enriched if row["ema_200"] and row["close"] > row["ema_200"])

    ema_breadth_by_period, highs_lows_by_period, ema_breadth_daily_history, ema_breadth_lookback = _build_period_views(
        client, latest_date, enriched,
    )

    if above_ema200_pct >= 60:
        market_phase = "Bullish"
        market_phase_desc = f"Strong breadth - {above_ema20_pct}% of stocks above 20 EMA"
    elif above_ema200_pct <= 40:
        market_phase = "Bearish"
        market_phase_desc = f"Weak breadth - only {above_ema200_pct}% of stocks above 200 EMA"
    else:
        market_phase = "Neutral"
        market_phase_desc = f"Mixed market - {above_ema200_pct}% of stocks above 200 EMA"

    sector_map: dict = defaultdict(lambda: {
        "total": 0,
        "advances": 0,
        "declines": 0,
        "pct_sum": 0.0,
        "ema20_valid": 0,
        "above_ema20": 0,
    })
    for row in enriched:
        sector = row["sector"] or "Unknown"
        sector_map[sector]["total"] += 1
        if row["pct_change"] > 0.05:
            sector_map[sector]["advances"] += 1
        elif row["pct_change"] < -0.05:
            sector_map[sector]["declines"] += 1
        sector_map[sector]["pct_sum"] += row["pct_change"]
        if row["ema_20"]:
            sector_map[sector]["ema20_valid"] += 1
            if row["close"] > row["ema_20"]:
                sector_map[sector]["above_ema20"] += 1

    sector_breadth: list[dict] = []
    for sector, data in sector_map.items():
        advance_breadth = round(data["advances"] / data["total"] * 100, 1)
        above_sector_ema20_pct = (
            round(data["above_ema20"] / data["ema20_valid"] * 100, 1)
            if data["ema20_valid"] else None
        )
        sector_breadth.append({
            "sector": sector,
            "total": data["total"],
            "advances": data["advances"],
            "declines": data["declines"],
            "avg_pct_change": round(data["pct_sum"] / data["total"], 2),
            "breadth_pct": advance_breadth,
            "advance_breadth_pct": advance_breadth,
            "above_ema20_pct": above_sector_ema20_pct,
            "basis": "advancing_constituents",
        })
    sector_breadth.sort(key=lambda item: (item["avg_pct_change"], item["breadth_pct"]), reverse=True)
    sector_taxonomy = build_sector_taxonomy_metadata(
        [{"symbol": row["symbol"], "sector": row.get("sector")} for row in enriched],
        active_count=len(enriched),
        active_count_scope="latest_complete_breadth_rows",
        hidden_min_active_symbols=1,
    )

    with_pct = [row for row in enriched if row["pct_change"] is not None]
    top_gainers = sorted(with_pct, key=lambda item: item["pct_change"], reverse=True)[:5]
    top_losers = sorted(with_pct, key=lambda item: item["pct_change"])[:5]
    with_volume = [row for row in enriched if row["volume_ratio"] is not None]
    most_active = sorted(with_volume, key=lambda item: item["volume_ratio"] or 0, reverse=True)[:5]

    coverage_pct = round((total / universe_active) * 100, 1) if universe_active else None
    coverage_status = (
        "healthy"
        if coverage_pct is None or coverage_pct >= MARKET_UNIVERSE_CONTRACT["healthy_coverage_pct"]
        else "degraded"
    )
    metadata = eod_source_metadata(
        as_of=latest_date,
        status=coverage_status,
        coverage_pct=coverage_pct,
        symbols_count=total,
        universe_active=universe_active or total,
        cache_status=cache_status,
    )

    generated_at = datetime.now(timezone.utc).isoformat()
    overview = {
        "trade_date": latest_date,
        "advances": advances,
        "declines": declines,
        "unchanged": unchanged,
        "total": total,
        "advance_decline_ratio": advance_decline_ratio,
        "new_52w_highs": new_highs,
        "new_52w_lows": new_lows,
        "above_ema20_count": above_ema20,
        "above_ema20_pct": above_ema20_pct,
        "above_ema50_count": above_ema50,
        "above_ema50_pct": above_ema50_pct,
        "above_ema200_count": above_ema200,
        "above_ema200_pct": above_ema200_pct,
        "ema_breadth_by_period": ema_breadth_by_period,
        "ema_breadth_daily_history": ema_breadth_daily_history,
        "ema_breadth_lookback": ema_breadth_lookback,
        "highs_lows_by_period": highs_lows_by_period,
        "market_phase": market_phase,
        "market_phase_desc": market_phase_desc,
        "sector_breadth": sector_breadth[:12],
        "sector_breadth_basis": "advancing_constituents",
        "sector_breadth_source": "latest_complete_nse_eq_universe",
        "sector_taxonomy": sector_taxonomy,
        "top_sectors": sector_breadth[:5],
        "top_gainers": [_mover(row) for row in top_gainers],
        "top_losers": [_mover(row) for row in top_losers],
        "most_active": [_mover(row) for row in most_active],
        "indices": indices or [],
        "market_data_source": quote_source,
        "is_live": indices_live,
        "as_of": latest_date,
        "generated_at": generated_at,
        "cache_status": cache_status,
        "provider": metadata,
        "source_metadata": metadata,
        "coverage_pct": coverage_pct,
        "universe_active": universe_active or total,
    }
    _assert_snapshot_quality(overview)
    return overview


def read_market_breadth_snapshot(
    client,
    trade_date: str | date,
    indices: list[dict],
    quote_source: str,
    indices_live: bool,
) -> dict | None:
    result = (
        client.table("ingest_runs")
        .select("run_id,started_at,meta")
        .eq("run_id", f"{SNAPSHOT_RUN_ID_PREFIX}-{trade_date}")
        .maybe_single()
        .execute()
    )
    row = result.data
    if not row:
        return None

    meta = row.get("meta") or {}
    overview = meta.get("overview") if isinstance(meta, dict) else None
    if not isinstance(overview, dict):
        return None
    if _snapshot_quality_error(overview):
        return None

    total = overview.get("total") or 0
    coverage_pct = overview.get("coverage_pct")
    universe_active = overview.get("universe_active") or total
    metadata = eod_source_metadata(
        as_of=overview.get("trade_date") or str(trade_date),
        status="healthy" if (coverage_pct is None or coverage_pct >= 90) else "degraded",
        coverage_pct=coverage_pct,
        symbols_count=total,
        universe_active=universe_active,
        cache_status="snapshot",
    )
    source_metadata = overview.get("source_metadata") or {}
    if isinstance(source_metadata, dict):
        metadata = {**source_metadata, **metadata}

    return {
        **overview,
        "indices": indices,
        "market_data_source": quote_source,
        "is_live": indices_live,
        "cache_status": "snapshot",
        "provider": metadata,
        "source_metadata": metadata,
    }


def read_latest_market_breadth_snapshot(
    client,
    indices: list[dict],
    quote_source: str,
    indices_live: bool,
) -> dict | None:
    result = (
        client.table("ingest_runs")
        .select("run_id,started_at,meta")
        .like("run_id", f"{SNAPSHOT_RUN_ID_PREFIX}-%")
        .order("started_at", desc=True)
        .limit(5)
        .execute()
    )
    for row in result.data or []:
        meta = row.get("meta") or {}
        overview = meta.get("overview") if isinstance(meta, dict) else None
        trade_date = overview.get("trade_date") if isinstance(overview, dict) else None
        if isinstance(overview, dict) and _snapshot_quality_error(overview):
            continue
        if trade_date:
            snapshot = read_market_breadth_snapshot(client, trade_date, indices, quote_source, indices_live)
            if snapshot:
                return snapshot
    return None


def persist_market_breadth_snapshot(client, trade_date: str | date) -> dict:
    snapshot = build_market_breadth_snapshot(client, trade_date, cache_status="snapshot_build")
    client.table("ingest_runs").upsert({
        "run_id": f"{SNAPSHOT_RUN_ID_PREFIX}-{snapshot['trade_date']}",
        "started_at": snapshot["generated_at"],
        "duration_s": 0,
        "event_count": 1,
        "error_count": 0,
        "errors": [],
        "meta": {
            "kind": "market_breadth_snapshot",
            "trade_date": snapshot["trade_date"],
            "overview": snapshot,
        },
    }, on_conflict="run_id").execute()
    return snapshot
