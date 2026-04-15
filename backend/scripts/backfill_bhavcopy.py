"""
Backfill historical NSE bhavcopy data.
Run from the backend directory:
    cd backend && python scripts/backfill_bhavcopy.py

Strategy:
  Phase 1 — Download + insert raw OHLCV for all dates (fast, ~2s/day)
  Phase 2 — Compute all indicators in one batch pass per symbol (fast, pandas in memory)

Total time: ~15-20 minutes for 300 trading days.
"""
import asyncio
import io
import sys
import time
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from app.services.bhavcopy import (  # noqa: E402
    COL_MAP, NSE_HEADERS, VALID_SERIES, _safe_float, _safe_int,
)
from app.services.supabase import get_admin_client  # noqa: E402

try:
    import pandas_ta as ta
except ImportError:
    ta = None
    print("WARNING: pandas_ta not available — indicators will be skipped")

NSE_HOLIDAYS = {
    date(2025, 1, 26), date(2025, 2, 26), date(2025, 3, 14),
    date(2025, 3, 31), date(2025, 4, 14), date(2025, 4, 18),
    date(2025, 5, 1),  date(2025, 8, 15), date(2025, 8, 27),
    date(2025, 10, 2), date(2025, 10, 24), date(2025, 11, 5),
    date(2025, 12, 25),
    date(2026, 1, 26), date(2026, 3, 25), date(2026, 4, 14),
}

SLEEP_BETWEEN = 2.5


def _trading_days(days_back: int) -> list[date]:
    today = date.today()
    start = today - timedelta(days=days_back)
    result = []
    d = start
    while d <= today:
        if d.weekday() < 5 and d not in NSE_HOLIDAYS:
            result.append(d)
        d += timedelta(days=1)
    return result


def _download_csv(trade_date: date, session: requests.Session) -> pd.DataFrame | None:
    date_str = trade_date.strftime("%d%m%Y")
    url = f"https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_{date_str}.csv"
    try:
        r = session.get(url, headers=NSE_HEADERS, timeout=30)
        if r.status_code == 404:
            return None
        r.raise_for_status()
        if len(r.content) < 500:
            return None
        df = pd.read_csv(io.BytesIO(r.content))
        df.columns = [c.strip() for c in df.columns]
        df.rename(columns={k: v for k, v in COL_MAP.items() if k in df.columns}, inplace=True)
        if "close" not in df.columns and "last_price" in df.columns:
            df["close"] = df["last_price"]
        required = {"symbol", "series", "open", "high", "low", "close", "volume"}
        if not required.issubset(df.columns):
            return None
        df["series"] = df["series"].str.strip().str.upper()
        df = df[df["series"].isin(VALID_SERIES)].copy()
        df["symbol"] = df["symbol"].str.strip().str.upper()
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
        df["trade_date"] = str(trade_date)
        return df
    except Exception as e:
        print(f"  download error {trade_date}: {e}")
        return None


def _upsert_universe(client, df: pd.DataFrame):
    rows = df[["symbol", "series"]].drop_duplicates("symbol").copy()
    if "company_name" in df.columns:
        rows = df[["symbol", "company_name", "series"]].drop_duplicates("symbol").copy()
    else:
        rows["company_name"] = rows["symbol"]
    rows["isin"] = None
    rows["is_active"] = True
    data = rows.to_dict("records")
    for i in range(0, len(data), 500):
        client.table("stock_universe").upsert(data[i:i+500], on_conflict="symbol").execute()


def _upsert_ohlcv(client, df: pd.DataFrame, trade_date: date):
    rows = []
    for _, row in df.iterrows():
        rows.append({
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
    for i in range(0, len(rows), 500):
        client.table("daily_ohlcv").upsert(rows[i:i+500], on_conflict="symbol,trade_date").execute()
    return len(rows)


def _compute_and_update_indicators(client):
    """Fetch all history per symbol in memory, compute indicators, bulk update."""
    if ta is None:
        print("  pandas_ta not available, skipping indicator computation")
        return

    print("\nPhase 2: Computing indicators for all symbols...")
    sym_res = client.table("stock_universe").select("symbol").eq("is_active", True).execute()
    symbols = [r["symbol"] for r in (sym_res.data or [])]
    print(f"  {len(symbols)} symbols to process")

    done = 0
    for symbol in symbols:
        try:
            hist = client.table("daily_ohlcv") \
                .select("id, trade_date, open, high, low, close, volume, prev_close") \
                .eq("symbol", symbol) \
                .order("trade_date", desc=False) \
                .limit(300) \
                .execute()
            if not hist.data or len(hist.data) < 2:
                continue

            hdf = pd.DataFrame(hist.data)
            for col in ["open", "high", "low", "close", "volume"]:
                hdf[col] = pd.to_numeric(hdf[col])
            n = len(hdf)
            close_s = hdf["close"]
            high_s  = hdf["high"]
            low_s   = hdf["low"]
            vol_s   = hdf["volume"]

            # Compute indicator series for the full history
            rsi_s    = ta.rsi(close_s, length=14) if n >= 15 else None
            ema20_s  = ta.ema(close_s, length=20)  if n >= 20 else None
            ema50_s  = ta.ema(close_s, length=50)  if n >= 50 else None
            ema200_s = ta.ema(close_s, length=200) if n >= 200 else None
            atr_s    = ta.atr(high_s, low_s, close_s, length=14) if n >= 15 else None

            updates = []
            for i, row in hdf.iterrows():
                ind: dict = {}
                pos = hdf.index.get_loc(i)

                # prev_close
                if pos > 0:
                    ind["prev_close"] = _safe_float(hdf["close"].iloc[pos - 1])

                # 52W window
                w_start = max(0, pos - 251)
                ind["week_52_high"] = _safe_float(hdf["high"].iloc[w_start:pos+1].max())
                ind["week_52_low"]  = _safe_float(hdf["low"].iloc[w_start:pos+1].min())

                # avg volume (exclude today)
                if pos > 0:
                    v_slice = vol_s.iloc[max(0, pos-20):pos]
                    ind["avg_volume_20d"] = _safe_int(v_slice.mean())

                if rsi_s is not None and pos < len(rsi_s):
                    ind["rsi_14"] = _safe_float(rsi_s.iloc[pos])
                if ema20_s is not None and pos < len(ema20_s):
                    ind["ema_20"] = _safe_float(ema20_s.iloc[pos])
                if ema50_s is not None and pos < len(ema50_s):
                    ind["ema_50"] = _safe_float(ema50_s.iloc[pos])
                if ema200_s is not None and pos < len(ema200_s):
                    ind["ema_200"] = _safe_float(ema200_s.iloc[pos])
                if atr_s is not None and pos < len(atr_s):
                    ind["atr_14"] = _safe_float(atr_s.iloc[pos])

                updates.append((row["trade_date"], ind))

            # Bulk update this symbol's indicators
            for td, ind in updates:
                if ind:
                    client.table("daily_ohlcv").update(ind) \
                        .eq("symbol", symbol).eq("trade_date", td).execute()

            done += 1
            if done % 100 == 0:
                print(f"  {done}/{len(symbols)} symbols done")

        except Exception as e:
            print(f"  indicator error {symbol}: {e}")
            continue

    print(f"  Indicator computation complete: {done}/{len(symbols)} symbols updated")


async def backfill(days_back: int = 300, indicators_only: bool = False):
    client = get_admin_client()
    days = _trading_days(days_back)
    print(f"Trading days to process: {len(days)} (from {days[0]} to {days[-1]})")

    if not indicators_only:
        # ── Phase 1: Download + insert raw OHLCV ──────────────────────────
        print("\nPhase 1: Downloading raw OHLCV...")
        session = requests.Session()
        session.get("https://www.nseindia.com/", headers=NSE_HEADERS, timeout=15)

        success = skipped = failed = 0
        for d in days:
            # Check already ingested
            existing = client.table("bhavcopy_ingestion_log") \
                .select("status").eq("trade_date", str(d)).execute()
            if existing.data and existing.data[0]["status"] == "success":
                print(f"  skip {d} (done)")
                skipped += 1
                continue

            df = _download_csv(d, session)
            if df is None:
                print(f"  skip {d} (no data / holiday)")
                skipped += 1
                continue

            try:
                _upsert_universe(client, df)
                n = _upsert_ohlcv(client, df, d)
                client.table("bhavcopy_ingestion_log").upsert({
                    "trade_date": str(d), "status": "success", "rows_ingested": n,
                }).execute()
                print(f"  ✓ {d}: {n} rows")
                success += 1
            except Exception as e:
                print(f"  ✗ {d}: {e}")
                client.table("bhavcopy_ingestion_log").upsert({
                    "trade_date": str(d), "status": "failed", "error_message": str(e)[:300],
                }).execute()
                failed += 1

            time.sleep(SLEEP_BETWEEN)

            # Re-prime session every 50 requests
            if (success + failed) % 50 == 0:
                try:
                    session = requests.Session()
                    session.get("https://www.nseindia.com/", headers=NSE_HEADERS, timeout=15)
                except Exception:
                    pass

        print(f"\nPhase 1 done — success:{success}  skipped:{skipped}  failed:{failed}")

    # ── Phase 2: Compute indicators ───────────────────────────────────────
    _compute_and_update_indicators(client)
    print("\nBackfill complete.")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=300)
    parser.add_argument("--indicators-only", action="store_true",
                        help="Skip Phase 1 download, only recompute indicators")
    args = parser.parse_args()
    asyncio.run(backfill(args.days, indicators_only=args.indicators_only))
