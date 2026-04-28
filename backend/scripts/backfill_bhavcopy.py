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

from app.services import indicators as ta

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


def _fetch_all_symbols(client) -> list[str]:
    """Fetch all active symbols, paginating past the 1000-row Supabase default."""
    symbols = []
    offset = 0
    while True:
        res = client.table("stock_universe") \
            .select("symbol") \
            .eq("is_active", True) \
            .range(offset, offset + 999) \
            .execute()
        if not res.data:
            break
        symbols.extend(r["symbol"] for r in res.data)
        if len(res.data) < 1000:
            break
        offset += 1000
    return symbols


def _compute_and_update_indicators(client):
    """
    Fast batch approach:
      1. Fetch 252 rows for up to 50 symbols at once (one big query per batch).
      2. Compute all indicators in pandas — zero extra HTTP calls.
      3. One UPDATE per symbol (latest date only) — the sidebar only shows the latest row.

    3285 symbols / 50 per batch = ~66 fetch calls + 3285 update calls ≈ 10-15 minutes.
    """
    print("\nPhase 2: Computing indicators for all symbols...")
    symbols = _fetch_all_symbols(client)
    total = len(symbols)
    print(f"  {total} symbols to process")

    BATCH = 50   # symbols fetched per query
    done = failed = 0
    start = time.time()

    for batch_start in range(0, total, BATCH):
        sym_batch = symbols[batch_start:batch_start + BATCH]

        # Recreate client every 500 symbols to avoid connection pool exhaustion
        if batch_start > 0 and batch_start % 500 == 0:
            client = get_admin_client()

        try:
            # Fetch up to 252 rows per symbol in one query (50 syms × 252 rows = 12600 max)
            all_rows: list[dict] = []
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
                continue

            hdf = pd.DataFrame(all_rows)
            for col in ["open", "high", "low", "close", "volume"]:
                hdf[col] = pd.to_numeric(hdf[col], errors="coerce")
            hdf["trade_date"] = pd.to_datetime(hdf["trade_date"])
            hdf.sort_values(["symbol", "trade_date"], inplace=True)

        except Exception as e:
            print(f"  fetch error batch {batch_start}: {e}")
            failed += len(sym_batch)
            client = get_admin_client()
            continue

        for symbol, grp in hdf.groupby("symbol", sort=False):
            try:
                grp = grp.tail(252).reset_index(drop=True)
                n = len(grp)
                if n < 2:
                    continue

                close_s = grp["close"]
                high_s  = grp["high"]
                low_s   = grp["low"]
                vol_s   = grp["volume"]

                ind: dict = {}
                ind["prev_close"]     = _safe_float(close_s.iloc[-2])
                ind["week_52_high"]   = _safe_float(high_s.max())
                ind["week_52_low"]    = _safe_float(low_s.min())
                ind["avg_volume_20d"] = _safe_int(vol_s.iloc[:-1].tail(20).mean())
                latest_high = _safe_float(high_s.iloc[-1])
                latest_low = _safe_float(low_s.iloc[-1])
                if ind["week_52_high"] is not None and latest_high is not None:
                    ind["is_new_52w_high"] = latest_high >= ind["week_52_high"]
                if ind["week_52_low"] is not None and latest_low is not None:
                    ind["is_new_52w_low"] = latest_low <= ind["week_52_low"]

                if n >= 15:
                    ind["rsi_14"] = _safe_float(ta.rsi(close_s, 14).iloc[-1])
                    ind["atr_14"] = _safe_float(ta.atr(high_s, low_s, close_s, 14).iloc[-1])
                if n >= 20:
                    ind["ema_20"] = _safe_float(ta.ema(close_s, 20).iloc[-1])
                if n >= 50:
                    ind["ema_50"] = _safe_float(ta.ema(close_s, 50).iloc[-1])
                if n >= 200:
                    ind["ema_200"] = _safe_float(ta.ema(close_s, 200).iloc[-1])

                latest_date = str(grp["trade_date"].iloc[-1].date())
                client.table("daily_ohlcv").update(ind) \
                    .eq("symbol", symbol).eq("trade_date", latest_date).execute()

                done += 1
            except Exception as e:
                print(f"  indicator error {symbol}: {e}")
                failed += 1

        if (batch_start + BATCH) % 500 < BATCH:
            elapsed = time.time() - start
            rate = done / elapsed if elapsed > 0 else 0
            remaining = (total - batch_start - BATCH) / rate if rate > 0 else 0
            print(f"  {done}/{total} done  |  {remaining/60:.1f} min remaining")

    print(f"  Indicator computation complete: {done}/{total} updated, {failed} failed")


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
