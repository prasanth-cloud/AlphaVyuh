-- 032_backfill_scanner_indicators.sql
--
-- Backfills sma_50, sma_150, sma_200, volume_ratio, w52h_pct, w52l_pct, rs_rating
-- for all rows in daily_ohlcv where those columns are NULL.
--
-- These columns were added in 028 with a comment "populated by the EOD ingest job
-- (implemented in a later PR)" — that PR never landed. This migration is the backfill;
-- bhavcopy.py is updated in the same PR to populate them going forward.
--
-- rs_rating uses PERCENT_RANK() over the universe on each trade_date to produce a
-- 1–99 integer (same scale expected by ScanFilters.rs_rating_min/max and the scanner
-- filter at scanner.py:343).
--
-- Run time estimate: ~2-5 minutes on prod (609k rows, ~3k symbols, 256 dates).
-- Safe to re-run — all CTEs are idempotent (updates where new value IS NOT NULL).

-- ─── Step 1: SMA-50, SMA-150, SMA-200 ──────────────────────────────────────────

WITH sma_calc AS (
    SELECT
        symbol,
        trade_date,
        CASE
            WHEN COUNT(*) OVER w50 = 50
            THEN ROUND(AVG(close) OVER w50, 2)
        END AS sma_50,
        CASE
            WHEN COUNT(*) OVER w150 = 150
            THEN ROUND(AVG(close) OVER w150, 2)
        END AS sma_150,
        CASE
            WHEN COUNT(*) OVER w200 = 200
            THEN ROUND(AVG(close) OVER w200, 2)
        END AS sma_200
    FROM daily_ohlcv
    WINDOW
        w50  AS (PARTITION BY symbol ORDER BY trade_date ROWS BETWEEN 49 PRECEDING AND CURRENT ROW),
        w150 AS (PARTITION BY symbol ORDER BY trade_date ROWS BETWEEN 149 PRECEDING AND CURRENT ROW),
        w200 AS (PARTITION BY symbol ORDER BY trade_date ROWS BETWEEN 199 PRECEDING AND CURRENT ROW)
)
UPDATE daily_ohlcv d
SET
    sma_50  = c.sma_50,
    sma_150 = c.sma_150,
    sma_200 = c.sma_200
FROM sma_calc c
WHERE d.symbol = c.symbol
  AND d.trade_date = c.trade_date
  AND (
      (c.sma_50  IS NOT NULL AND d.sma_50  IS NULL) OR
      (c.sma_150 IS NOT NULL AND d.sma_150 IS NULL) OR
      (c.sma_200 IS NOT NULL AND d.sma_200 IS NULL)
  );

-- ─── Step 2: volume_ratio, w52h_pct, w52l_pct ────────────────────────────────

WITH derived AS (
    SELECT
        symbol,
        trade_date,
        close,
        volume,
        -- avg_volume_20d: previous 20 sessions (excludes current row — matches bhavcopy.py)
        ROUND(
            AVG(volume) OVER (
                PARTITION BY symbol ORDER BY trade_date
                ROWS BETWEEN 20 PRECEDING AND 1 PRECEDING
            )::numeric,
            4
        ) AS avg_vol_20,
        -- 52-week high/low over the window we have (up to 252 rows back)
        MAX(high) OVER (
            PARTITION BY symbol ORDER BY trade_date
            ROWS BETWEEN 251 PRECEDING AND CURRENT ROW
        ) AS w52_high,
        MIN(low) OVER (
            PARTITION BY symbol ORDER BY trade_date
            ROWS BETWEEN 251 PRECEDING AND CURRENT ROW
        ) AS w52_low
    FROM daily_ohlcv
),
calcs AS (
    SELECT
        symbol,
        trade_date,
        CASE
            WHEN avg_vol_20 > 0
            THEN ROUND(volume::numeric / avg_vol_20, 4)
        END AS volume_ratio,
        CASE
            WHEN w52_high > 0
            THEN ROUND((close - w52_high) / w52_high * 100.0, 4)
        END AS w52h_pct,
        CASE
            WHEN w52_low > 0
            THEN ROUND((close - w52_low) / w52_low * 100.0, 4)
        END AS w52l_pct
    FROM derived
)
UPDATE daily_ohlcv d
SET
    volume_ratio = c.volume_ratio,
    w52h_pct     = c.w52h_pct,
    w52l_pct     = c.w52l_pct
FROM calcs c
WHERE d.symbol = c.symbol
  AND d.trade_date = c.trade_date
  AND (
      (c.volume_ratio IS NOT NULL AND d.volume_ratio IS NULL) OR
      (c.w52h_pct     IS NOT NULL AND d.w52h_pct     IS NULL) OR
      (c.w52l_pct     IS NOT NULL AND d.w52l_pct     IS NULL)
  );

-- ─── Step 3: rs_rating (1–99, Minervini scale) ────────────────────────────────
--
-- RS = PERCENT_RANK() of today's close vs yesterday's close (1-day momentum proxy)
--      relative to all NSE EQ symbols on the same date.
-- Scaled to 1–99 integer: ROUND(PERCENT_RANK() * 98 + 1).
-- LAG(close, 252) requires 252+ prior rows; symbols with < 252 rows get NULL.
-- In the current 256-date prod window, ~4 dates per symbol have a valid LAG(252).

WITH momentum AS (
    SELECT
        symbol,
        trade_date,
        close,
        LAG(close, 252) OVER (PARTITION BY symbol ORDER BY trade_date) AS close_252d_ago
    FROM daily_ohlcv
),
ranked AS (
    SELECT
        symbol,
        trade_date,
        CASE
            WHEN close_252d_ago IS NOT NULL AND close_252d_ago > 0
            THEN ROUND(
                PERCENT_RANK() OVER (
                    PARTITION BY trade_date
                    ORDER BY (close - close_252d_ago) / close_252d_ago
                ) * 98 + 1
            )::integer
        END AS rs_rating
    FROM momentum
)
UPDATE daily_ohlcv d
SET rs_rating = r.rs_rating
FROM ranked r
WHERE d.symbol = r.symbol
  AND d.trade_date = r.trade_date
  AND r.rs_rating IS NOT NULL
  AND d.rs_rating IS NULL;

-- ─── Step 4: RPC for ongoing daily rs_rating computation ─────────────────────
--
-- Called by bhavcopy.py after each ingest to compute rs_rating for the new date.
-- Uses LAG(close, 252) scoped to the single p_trade_date being processed.

CREATE OR REPLACE FUNCTION compute_rs_rating_for_date(p_trade_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    WITH momentum AS (
        SELECT
            symbol,
            trade_date,
            close,
            LAG(close, 252) OVER (PARTITION BY symbol ORDER BY trade_date) AS close_252d_ago
        FROM daily_ohlcv
        WHERE trade_date <= p_trade_date
    ),
    ranked AS (
        SELECT
            symbol,
            CASE
                WHEN close_252d_ago IS NOT NULL AND close_252d_ago > 0
                THEN ROUND(
                    PERCENT_RANK() OVER (
                        ORDER BY (close - close_252d_ago) / close_252d_ago
                    ) * 98 + 1
                )::integer
            END AS rs_rating
        FROM momentum
        WHERE trade_date = p_trade_date
    )
    UPDATE daily_ohlcv d
    SET rs_rating = r.rs_rating
    FROM ranked r
    WHERE d.symbol = r.symbol
      AND d.trade_date = p_trade_date
      AND r.rs_rating IS NOT NULL;
END;
$$;
