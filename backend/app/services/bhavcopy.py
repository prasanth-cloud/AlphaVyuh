import io
import logging
from datetime import date, datetime, timedelta, timezone

import numpy as np
import pandas as pd
import requests

from app.services import indicators as ta
from app.services.supabase import get_admin_client

logger = logging.getLogger(__name__)

NSE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.nseindia.com/",
    "Connection": "keep-alive",
}

VALID_SERIES = {"EQ", "BE", "BZ", "SM", "ST"}
SOURCE_NAME = "NSE bhavcopy EOD"

COL_MAP = {
    # Symbol
    "SYMBOL": "symbol", "Symbol": "symbol",
    # Series
    "SERIES": "series", "Series": "series",
    # Company name (not present in sec_bhavdata_full — handled below)
    "COMPANY NAME": "company_name", "CompanyName": "company_name",
    "NAME OF COMPANY": "company_name",
    # OHLCV — sec_bhavdata_full uses OPEN_PRICE etc.
    "OPEN": "open", "OpenPrice": "open", "OPEN_PRICE": "open",
    "HIGH": "high", "HighPrice": "high", "HIGH_PRICE": "high",
    "LOW": "low", "LowPrice": "low", "LOW_PRICE": "low",
    "CLOSE": "close", "ClosePrice": "close", "CLOSE_PRICE": "close",
    "LAST_PRICE": "last_price", "LAST": "last_price",
    # Volume
    "TOTTRDQTY": "volume", "TotalTradedQuantity": "volume", "TTL_TRD_QNTY": "volume",
    # Turnover
    "TOTTRDVAL": "turnover", "TurnoverLakhs": "turnover",
    "TURNOVER_LACS": "turnover", "TURNOVER_LAKHS": "turnover",
    # Prev close
    "PREVCLOSE": "prev_close", "PrevClose": "prev_close", "PREV_CLOSE": "prev_close",
    # ISIN
    "ISIN": "isin", "ISIN No": "isin", "ISIN NUMBER": "isin",
    # Trade date
    "DATE1": "trade_date_col", "TIMESTAMP": "trade_date_col",
}


def _safe_float(val):
    try:
        f = float(val)
        return None if np.isnan(f) or np.isinf(f) else f
    except (TypeError, ValueError):
        return None


def _safe_int(val):
    try:
        f = float(val)
        return None if np.isnan(f) else int(f)
    except (TypeError, ValueError):
        return None


def _upsert_ingest_log(client, payload: dict) -> None:
    payload = {**payload, "updated_at": datetime.now(timezone.utc).isoformat()}
    try:
        client.table("bhavcopy_ingestion_log").upsert(payload).execute()
    except Exception:
        legacy_keys = {
            "trade_date",
            "status",
            "rows_ingested",
            "error_message",
            "created_at",
            "updated_at",
        }
        client.table("bhavcopy_ingestion_log").upsert(
            {key: value for key, value in payload.items() if key in legacy_keys}
        ).execute()


def _expected_active_rows(client, series: set[str] = VALID_SERIES) -> int | None:
    try:
        result = (
            client.table("stock_universe")
            .select("symbol", count="exact")
            .eq("is_active", True)
            .in_("series", sorted(series))
            .execute()
        )
        return result.count
    except Exception:
        return None


def _compute_indicators_bulk(client, symbols: list[str], trade_date: date) -> list[tuple]:
    """
    Fetch last 252 rows for all symbols in a single paginated query,
    compute indicators in pandas, return list of (symbol, indicators_dict).
    Far faster than one query per symbol.
    """
    if not symbols:
        return []

    # Fetch history in symbol batches (max 100/batch to stay within URL limits)
    all_rows: list[dict] = []
    BATCH = 100
    for i in range(0, len(symbols), BATCH):
        sym_batch = symbols[i:i + BATCH]
        offset = 0
        while True:
            chunk = client.table("daily_ohlcv") \
                .select("symbol, trade_date, open, high, low, close, volume") \
                .in_("symbol", sym_batch) \
                .order("trade_date", desc=False) \
                .range(offset, offset + 999) \
                .execute()
            if not chunk.data:
                break
            all_rows.extend(chunk.data)
            if len(chunk.data) < 1000:
                break
            offset += 1000

    if not all_rows:
        return []

    hdf = pd.DataFrame(all_rows)
    for col in ["open", "high", "low", "close", "volume"]:
        hdf[col] = pd.to_numeric(hdf[col])
    hdf["trade_date"] = pd.to_datetime(hdf["trade_date"])
    hdf.sort_values(["symbol", "trade_date"], inplace=True)

    results = []
    today_str = str(trade_date)

    for symbol, grp in hdf.groupby("symbol", sort=False):
        grp = grp.tail(252).reset_index(drop=True)
        n = len(grp)
        close_s = grp["close"]
        high_s  = grp["high"]
        low_s   = grp["low"]
        vol_s   = grp["volume"]

        ind: dict = {}

        cur_close = _safe_float(close_s.iloc[-1])
        cur_high  = _safe_float(high_s.iloc[-1])
        cur_low   = _safe_float(low_s.iloc[-1])
        cur_vol   = _safe_int(vol_s.iloc[-1])

        if n >= 2:
            pc = _safe_float(close_s.iloc[-2])
            ind["prev_close"] = pc
            avg_vol_20 = _safe_float(vol_s.iloc[:-1].tail(20).mean())
            ind["avg_volume_20d"] = _safe_int(avg_vol_20) if avg_vol_20 is not None else None
            if pc and pc > 0 and cur_close is not None:
                ind["pct_change"] = round((cur_close - pc) / pc * 100, 2)
            # volume_ratio: today's volume / avg of previous 20 sessions
            if avg_vol_20 and avg_vol_20 > 0 and cur_vol is not None:
                ind["volume_ratio"] = round(cur_vol / avg_vol_20, 4)

        ind["week_52_high"] = _safe_float(high_s.max())
        ind["week_52_low"]  = _safe_float(low_s.min())

        # w52h_pct / w52l_pct: % distance from 52w high/low
        w52h = ind["week_52_high"]
        w52l = ind["week_52_low"]
        if w52h and w52h > 0 and cur_close is not None:
            ind["w52h_pct"] = round((w52h - cur_close) / cur_close * 100.0, 4) if cur_close > 0 else None
        if w52h is not None and cur_high is not None:
            ind["is_new_52w_high"] = cur_high >= w52h
        if w52l and w52l > 0 and cur_close is not None:
            ind["w52l_pct"] = round((cur_close - w52l) / w52l * 100.0, 4)
        if w52l is not None and cur_low is not None:
            ind["is_new_52w_low"] = cur_low <= w52l

        try:
            if n >= 15:
                ind["rsi_14"] = _safe_float(ta.rsi(close_s, 14).iloc[-1])
                ind["atr_14"] = _safe_float(ta.atr(high_s, low_s, close_s, 14).iloc[-1])
            if n >= 20:
                ind["ema_20"] = _safe_float(ta.ema(close_s, 20).iloc[-1])
            if n >= 50:
                ind["ema_50"] = _safe_float(ta.ema(close_s, 50).iloc[-1])
                ind["sma_50"] = _safe_float(close_s.rolling(50, min_periods=50).mean().iloc[-1])
            if n >= 150:
                ind["sma_150"] = _safe_float(close_s.rolling(150, min_periods=150).mean().iloc[-1])
            if n >= 200:
                ind["ema_200"] = _safe_float(ta.ema(close_s, 200).iloc[-1])
                ind["sma_200"] = _safe_float(close_s.rolling(200, min_periods=200).mean().iloc[-1])
        except Exception as e:
            logger.warning(f"indicator error for {symbol}: {e}")

        if ind:
            results.append((symbol, ind))

    return results


async def download_and_ingest(trade_date: date) -> dict:
    client = get_admin_client()
    date_str = trade_date.strftime("%d%m%Y")
    source_url = f"https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_{date_str}.csv"

    if trade_date.weekday() >= 5:
        _upsert_ingest_log(client, {
            "trade_date": str(trade_date),
            "status": "skipped",
            "source_name": SOURCE_NAME,
            "source_url": source_url,
            "warning_message": "Weekend/non-trading day skipped before download.",
            "completed_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"status": "skipped", "trade_date": str(trade_date), "reason": "weekend"}

    # 1. Check if already ingested
    existing = client.table("bhavcopy_ingestion_log") \
        .select("status,rows_ingested") \
        .eq("trade_date", str(trade_date)) \
        .execute()
    if existing.data and existing.data[0]["status"] == "success" and (existing.data[0].get("rows_ingested") or 0) > 0:
        return {"status": "already_done", "trade_date": str(trade_date), "rows_ingested": existing.data[0].get("rows_ingested")}

    # 2. Mark as pending
    attempt_count = 1
    try:
        if existing.data:
            attempt_count = int(existing.data[0].get("attempt_count") or 0) + 1
    except Exception:
        attempt_count = 1
    _upsert_ingest_log(client, {
        "trade_date": str(trade_date),
        "status": "pending",
        "source_name": SOURCE_NAME,
        "source_url": source_url,
        "attempt_count": attempt_count,
    })

    try:
        # 3. Download bhavcopy CSV
        session = requests.Session()
        # Prime cookies by hitting NSE homepage first
        session.get("https://www.nseindia.com/", headers=NSE_HEADERS, timeout=15)
        response = session.get(source_url, headers=NSE_HEADERS, timeout=30)
        response.raise_for_status()

        if len(response.content) < 500:
            _upsert_ingest_log(client, {
                "trade_date": str(trade_date),
                "status": "skipped",
                "source_name": SOURCE_NAME,
                "source_url": source_url,
                "warning_message": f"Response too small ({len(response.content)} bytes) — likely holiday/non-trading day.",
                "completed_at": datetime.now(timezone.utc).isoformat(),
            })
            return {"status": "skipped", "trade_date": str(trade_date), "reason": "holiday_or_unpublished"}

        # 4. Parse CSV
        df = pd.read_csv(io.BytesIO(response.content))
        df.columns = [c.strip() for c in df.columns]
        df.rename(columns={k: v for k, v in COL_MAP.items() if k in df.columns}, inplace=True)

        # If 'close' still missing but 'last_price' exists, use it as close
        if "close" not in df.columns and "last_price" in df.columns:
            df["close"] = df["last_price"]

        required = {"symbol", "series", "open", "high", "low", "close", "volume"}
        missing = required - set(df.columns)
        if missing:
            raise ValueError(f"Missing columns after normalisation: {missing}. Available: {list(df.columns)}")

        # 5. Filter valid series
        df["series"] = df["series"].str.strip().str.upper()
        df = df[df["series"].isin(VALID_SERIES)].copy()
        df["symbol"] = df["symbol"].str.strip().str.upper()

        if "company_name" not in df.columns:
            df["company_name"] = df["symbol"]
        else:
            df["company_name"] = df["company_name"].str.strip()

        if "isin" not in df.columns:
            df["isin"] = None

        for col in ["open", "high", "low", "close", "volume"]:
            df[col] = pd.to_numeric(df[col], errors="coerce")
        df = df.dropna(subset=["open", "high", "low", "close", "volume"])

        if "prev_close" not in df.columns:
            df["prev_close"] = None
        else:
            df["prev_close"] = pd.to_numeric(df["prev_close"], errors="coerce")

        if "turnover" not in df.columns:
            df["turnover"] = None
        else:
            df["turnover"] = pd.to_numeric(df["turnover"], errors="coerce")

        # 6. Upsert stock_universe
        universe_rows = df[["symbol", "company_name", "series", "isin"]].drop_duplicates("symbol")
        universe_data = []
        for _, row in universe_rows.iterrows():
            universe_data.append({
                "symbol": row["symbol"],
                "company_name": row["company_name"],
                "series": row["series"],
                "isin": row["isin"] if pd.notna(row.get("isin")) else None,
                "is_active": True,
            })

        # Batch upsert in chunks of 500
        for i in range(0, len(universe_data), 500):
            client.table("stock_universe").upsert(
                universe_data[i:i+500],
                on_conflict="symbol"
            ).execute()

        # 7. Upsert raw OHLCV
        ohlcv_rows = []
        for _, row in df.iterrows():
            ohlcv_rows.append({
                "symbol": row["symbol"],
                "trade_date": str(trade_date),
                "open": _safe_float(row["open"]),
                "high": _safe_float(row["high"]),
                "low": _safe_float(row["low"]),
                "close": _safe_float(row["close"]),
                "prev_close": _safe_float(row.get("prev_close")),
                "volume": _safe_int(row["volume"]),
                "turnover": _safe_float(row.get("turnover")),
            })

        for i in range(0, len(ohlcv_rows), 500):
            client.table("daily_ohlcv").upsert(
                ohlcv_rows[i:i+500],
                on_conflict="symbol,trade_date"
            ).execute()

        rows_ingested = len(ohlcv_rows)
        logger.info(f"Ingested {rows_ingested} rows for {trade_date}")
        expected_rows = _expected_active_rows(client)
        coverage_pct = round((rows_ingested / expected_rows) * 100, 2) if expected_rows else None
        partial_ingest = bool(expected_rows and rows_ingested < max(100, int(expected_rows * 0.9)))
        warning_message = (
            f"Partial ingest: {rows_ingested}/{expected_rows} active symbols ({coverage_pct}%)."
            if partial_ingest else None
        )

        # 8 & 9. Compute indicators via bulk fetch (one query, not N queries)
        update_batch = _compute_indicators_bulk(client, df["symbol"].unique().tolist(), trade_date)

        # Batch update indicators (500 per chunk)
        for symbol, indicators in update_batch:
            try:
                client.table("daily_ohlcv") \
                    .update(indicators) \
                    .eq("symbol", symbol) \
                    .eq("trade_date", str(trade_date)) \
                    .execute()
            except Exception as upd_err:
                logger.warning(f"Update error for {symbol}: {upd_err}")

        # Compute rs_score: requires cross-symbol PERCENT_RANK — done via SQL
        # after per-symbol updates so today's close + lag(close,252) are in place.
        try:
            client.rpc("compute_rs_score_for_date", {"p_trade_date": str(trade_date)}).execute()
        except Exception as rs_err:
            logger.warning(f"rs_score RPC failed for {trade_date}: {rs_err}")

        # 11. Log success
        _upsert_ingest_log(client, {
            "trade_date": str(trade_date),
            "status": "partial" if partial_ingest else "success",
            "rows_ingested": rows_ingested,
            "source_name": SOURCE_NAME,
            "source_url": source_url,
            "expected_rows": expected_rows,
            "coverage_pct": coverage_pct,
            "partial_ingest": partial_ingest,
            "warning_message": warning_message,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        })

        return {
            "status": "partial" if partial_ingest else "success",
            "trade_date": str(trade_date),
            "rows_ingested": rows_ingested,
            "expected_rows": expected_rows,
            "coverage_pct": coverage_pct,
            "partial_ingest": partial_ingest,
        }

    except Exception as e:
        logger.error(f"Ingest failed for {trade_date}: {e}")
        _upsert_ingest_log(client, {
            "trade_date": str(trade_date),
            "status": "failed",
            "error_message": str(e)[:500],
            "source_name": SOURCE_NAME,
            "source_url": source_url,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        })
        raise
