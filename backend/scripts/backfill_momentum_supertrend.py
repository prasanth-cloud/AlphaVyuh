"""
Backfill momentum_5d/10d/20d, supertrend_direction, and prev_macd_hist for all
historical rows in daily_ohlcv (migration 031 columns).

Run from the backend directory:
    cd backend && python scripts/backfill_momentum_supertrend.py

Strategy:
  - Fetch all distinct symbols
  - For each symbol, load its full OHLCV history (ordered ASC)
  - Compute the five M3-E indicators in pandas
  - UPDATE only rows where momentum_5d IS NULL (idempotent, safe to re-run)
  - Processes symbols in batches; logs progress + ETA
  - Flags symbols with a suspected corporate-action artifact (>40% single-day drop)

Resume: re-running the script is safe — it skips rows already populated.
Stop condition: if a symbol batch raises three consecutive errors, the script
aborts and logs which symbol it stopped at, so you can resume from there.

Target: ~3,000 symbols × ~250 rows = 750,000 updates. Expect 10-20 min on
a warm connection to Supabase staging.
"""
from __future__ import annotations

import sys
import time
import logging
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from app.services import indicators as ta  # noqa: E402
from app.services.supabase import get_admin_client  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

FETCH_BATCH = 100   # symbols per history fetch
UPDATE_BATCH = 500  # rows per upsert call
MAX_ERRORS = 3      # consecutive errors before abort


def _safe_float(val) -> float | None:
    try:
        f = float(val)
        return None if (np.isnan(f) or np.isinf(f)) else f
    except (TypeError, ValueError):
        return None


def _compute_for_symbol(symbol: str, grp: pd.DataFrame) -> list[dict]:
    """
    Given a DataFrame of all rows for one symbol (sorted ASC by trade_date),
    return a list of update dicts {symbol, trade_date, <col>: value} for rows
    where at least one M3-E column can be populated.

    Only produces updates for rows where momentum_5d IS NULL.
    """
    grp = grp.sort_values("trade_date").reset_index(drop=True)

    close_s = grp["close"].astype(float)
    high_s  = grp["high"].astype(float)
    low_s   = grp["low"].astype(float)
    n = len(grp)

    # MACD histogram series for prev_macd_hist
    hist_s = None
    if n >= 36:
        _, _, hist_s = ta.macd(close_s)

    # Supertrend direction series
    st_dir_s = None
    if n >= 30:
        st_dir_s = ta.supertrend(high_s, low_s, close_s, period=10, multiplier=3.0)

    # Flag suspected corporate-action rows: any single-day close drop > 40%
    pct_chg = close_s.pct_change()
    artifact_indices = set(grp.index[pct_chg < -0.40].tolist())
    if artifact_indices:
        affected = grp.loc[list(artifact_indices), "trade_date"].tolist()
        logger.warning(
            f"[{symbol}] Suspected split/bonus artifact on {affected} "
            f"(>40%% drop) — values computed as-is, check manually"
        )

    updates = []
    for i, row in grp.iterrows():
        # Skip rows already populated (idempotent)
        if row.get("momentum_5d") is not None:
            continue

        update: dict = {"symbol": symbol, "trade_date": str(row["trade_date"])}

        # momentum_5d: need close 5 sessions ago (index i-5 in grp)
        if i >= 5:
            c0 = _safe_float(close_s.iloc[i - 5])
            c1 = _safe_float(close_s.iloc[i])
            if c0 and c0 > 0 and c1 is not None:
                update["momentum_5d"] = round((c1 - c0) / c0 * 100, 4)

        if i >= 10:
            c0 = _safe_float(close_s.iloc[i - 10])
            c1 = _safe_float(close_s.iloc[i])
            if c0 and c0 > 0 and c1 is not None:
                update["momentum_10d"] = round((c1 - c0) / c0 * 100, 4)

        if i >= 20:
            c0 = _safe_float(close_s.iloc[i - 20])
            c1 = _safe_float(close_s.iloc[i])
            if c0 and c0 > 0 and c1 is not None:
                update["momentum_20d"] = round((c1 - c0) / c0 * 100, 4)

        if st_dir_s is not None and i < len(st_dir_s):
            d = int(st_dir_s.iloc[i])
            update["supertrend_direction"] = d if d != 0 else None

        if hist_s is not None and i >= 1 and i < len(hist_s):
            prev_h = _safe_float(hist_s.iloc[i - 1])
            update["prev_macd_hist"] = prev_h

        # Only emit an update if there's at least one new value beyond the keys
        if len(update) > 2:
            updates.append(update)

    return updates


def _fetch_symbols(client) -> list[str]:
    symbols: list[str] = []
    offset = 0
    while True:
        r = client.table("stock_universe") \
            .select("symbol") \
            .eq("is_active", True) \
            .range(offset, offset + 999) \
            .execute()
        if not r.data:
            break
        symbols.extend(row["symbol"] for row in r.data)
        if len(r.data) < 1000:
            break
        offset += 1000
    return symbols


def _fetch_history(client, symbols: list[str]) -> pd.DataFrame:
    all_rows: list[dict] = []
    offset = 0
    while True:
        chunk = client.table("daily_ohlcv") \
            .select("symbol,trade_date,open,high,low,close,momentum_5d") \
            .in_("symbol", symbols) \
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
        return pd.DataFrame()
    df = pd.DataFrame(all_rows)
    for col in ["open", "high", "low", "close"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


def main():
    client = get_admin_client()

    logger.info("Fetching active symbols …")
    symbols = _fetch_symbols(client)
    logger.info(f"  {len(symbols)} active symbols")

    total_updates = 0
    consecutive_errors = 0
    t_start = time.time()

    for batch_start in range(0, len(symbols), FETCH_BATCH):
        batch = symbols[batch_start : batch_start + FETCH_BATCH]
        batch_num = batch_start // FETCH_BATCH + 1
        total_batches = (len(symbols) + FETCH_BATCH - 1) // FETCH_BATCH

        elapsed = time.time() - t_start
        done_pct = batch_start / len(symbols)
        if done_pct > 0:
            eta_s = elapsed / done_pct * (1 - done_pct)
            eta_str = f"ETA {eta_s/60:.1f}m"
        else:
            eta_str = "ETA –"

        logger.info(
            f"Batch {batch_num}/{total_batches} ({batch[0]}…{batch[-1]}) "
            f"— {done_pct*100:.0f}% done, {eta_str}"
        )

        try:
            df = _fetch_history(client, batch)
            if df.empty:
                continue

            update_rows: list[dict] = []
            for symbol, grp in df.groupby("symbol", sort=False):
                updates = _compute_for_symbol(symbol, grp)
                update_rows.extend(updates)

            # Upsert in batches of UPDATE_BATCH
            for i in range(0, len(update_rows), UPDATE_BATCH):
                chunk = update_rows[i : i + UPDATE_BATCH]
                client.table("daily_ohlcv").upsert(
                    chunk, on_conflict="symbol,trade_date"
                ).execute()

            total_updates += len(update_rows)
            consecutive_errors = 0
            logger.info(f"  → {len(update_rows)} rows updated (total so far: {total_updates})")

        except Exception as e:
            consecutive_errors += 1
            logger.error(f"  Error on batch {batch_num}: {e}")
            if consecutive_errors >= MAX_ERRORS:
                logger.error(
                    f"  {MAX_ERRORS} consecutive errors — aborting. "
                    f"Resume by starting from symbol '{batch[0]}'"
                )
                sys.exit(1)

    elapsed_total = time.time() - t_start
    logger.info(
        f"Backfill complete. {total_updates} rows updated in {elapsed_total/60:.1f}m"
    )


if __name__ == "__main__":
    main()
