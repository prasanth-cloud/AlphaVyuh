"""Scanner intelligence calculations shared by backfill/refresh jobs.

The functions here are pure dataframe transforms so they can be unit tested
without touching Supabase.
"""
from __future__ import annotations

import pandas as pd


INTELLIGENCE_COLUMNS = [
    "ema_150",
    "ema_200_slope_30d",
    "avg_volume_50d",
    "price_perf_6m_pct",
    "high_3w",
    "low_3w",
    "darvas_box_height_pct",
    "is_nr7",
]


def compute_scanner_intelligence_frame(rows: pd.DataFrame) -> pd.DataFrame:
    """Compute swing-scanner helper columns for symbol/date ordered OHLCV rows."""
    if rows.empty:
        return rows.copy()

    required = {"symbol", "trade_date", "close", "high", "low", "volume"}
    missing = required - set(rows.columns)
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(sorted(missing))}")

    df = rows.copy()
    df["trade_date"] = pd.to_datetime(df["trade_date"])
    df = df.sort_values(["symbol", "trade_date"]).reset_index(drop=True)

    grouped = df.groupby("symbol", group_keys=False)
    if "ema_150" not in df.columns:
        df["ema_150"] = pd.NA
    df["ema_150"] = grouped["close"].transform(
        lambda series: series.ewm(span=150, adjust=False, min_periods=150).mean()
    ).where(df["ema_150"].isna(), df["ema_150"])

    if "ema_200" in df.columns:
        ema200 = pd.to_numeric(df["ema_200"], errors="coerce")
        shifted = ema200.groupby(df["symbol"]).shift(30)
        df["ema_200_slope_30d"] = ((ema200 - shifted) / shifted * 100).round(4)
    else:
        df["ema_200_slope_30d"] = pd.NA

    volume = pd.to_numeric(df["volume"], errors="coerce")
    df["avg_volume_50d"] = volume.groupby(df["symbol"]).transform(
        lambda series: series.rolling(50, min_periods=20).mean()
    ).round()

    close = pd.to_numeric(df["close"], errors="coerce")
    prior_6m = close.groupby(df["symbol"]).shift(126)
    df["price_perf_6m_pct"] = ((close - prior_6m) / prior_6m * 100).round(4)

    high = pd.to_numeric(df["high"], errors="coerce")
    low = pd.to_numeric(df["low"], errors="coerce")
    df["high_3w"] = high.groupby(df["symbol"]).transform(
        lambda series: series.rolling(15, min_periods=5).max()
    )
    df["low_3w"] = low.groupby(df["symbol"]).transform(
        lambda series: series.rolling(15, min_periods=5).min()
    )
    df["darvas_box_height_pct"] = (
        (df["high_3w"] - df["low_3w"]) / df["low_3w"] * 100
    ).round(4)

    day_range = high - low
    rolling_min_range = day_range.groupby(df["symbol"]).transform(
        lambda series: series.rolling(7, min_periods=7).min()
    )
    df["is_nr7"] = day_range.eq(rolling_min_range)

    return df


def to_backfill_payload(rows: pd.DataFrame, from_date: str, to_date: str) -> list[dict]:
    """Convert computed rows into Supabase upsert payload for a bounded window."""
    if rows.empty:
        return []

    computed = rows.copy()
    computed["trade_date"] = pd.to_datetime(computed["trade_date"])
    mask = (
        (computed["trade_date"] >= pd.to_datetime(from_date))
        & (computed["trade_date"] <= pd.to_datetime(to_date))
    )
    bounded = computed.loc[mask, ["symbol", "trade_date", *INTELLIGENCE_COLUMNS]].copy()
    bounded["trade_date"] = bounded["trade_date"].dt.date.astype(str)

    payload: list[dict] = []
    for record in bounded.where(pd.notna(bounded), None).to_dict(orient="records"):
        payload.append(record)
    return payload
