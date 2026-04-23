-- 032_backfill_scanner_indicators.sql
--
-- Backfills sma_50, sma_150, sma_200, volume_ratio, w52h_pct, w52l_pct, rs_rating
-- for all rows in daily_ohlcv where those columns are NULL.
--
-- WHY THIS MIGRATION EXISTS
-- These columns were added in 028 with a comment "populated by the EOD ingest job
-- (implemented in a later PR)" — that PR never landed. This migration is the backfill;
-- bhavcopy.py is updated in the same PR to populate them going forward.
--
-- WHAT GETS POPULATED VS STAYS NULL
-- Step 1 (SMA):       Populated for any row that has 50/150/200 prior rows for its
--                     symbol. With 256 dates in prod, sma_50 populates most rows,
--                     sma_150/200 only rows where the symbol has 150/200+ dates of
--                     history.
--
-- Step 2 (volume_ratio, w52h_pct, w52l_pct):
--                     Uses already-stored week_52_high, week_52_low, avg_volume_20d
--                     columns as inputs (arithmetic only — no window functions).
--                     These underlying columns are populated only on rows where the
--                     EOD ingest computed indicators (~198k of 612k rows as of
--                     2026-04-22). The remaining ~414k older rows where the underlying
--                     columns are NULL will produce NULL output here too — this is
--                     correct and acceptable. The scanner queries latest_date only
--                     (2026-04-22, fully populated), so it is unaffected.
--                     Backfilling older rows would require a separate migration that
--                     first populates week_52_high/week_52_low/avg_volume_20d across
--                     all historical rows. Not needed for MVP.
--
-- Step 3 (rs_rating): Requires LAG(close, 252). With 256 dates of history, only the
--                     last 4 dates per symbol have a non-NULL LAG(252). Correct
--                     behaviour — scanner uses latest_date which is within this window.
--
-- IDEMPOTENCY
-- Safe to re-run. All UPDATE statements are guarded by IS NULL checks on the target
-- columns, so re-running overwrites nothing already populated (same values would
-- result anyway from the same source data).
--
-- PARITY WITH bhavcopy.py (Step 2 arithmetic)
-- volume_ratio:  volume / avg_volume_20d using stored integer avg_volume_20d.
--                bhavcopy.py uses the raw float before rounding to int, so there may
--                be a sub-0.001 difference at the 4th decimal place. Not scanner-relevant.
-- w52h_pct/w52l_pct: identical formula to bhavcopy.py lines 140-143.

-- Session-level (not LOCAL) so it covers all steps regardless of transaction wrapping.
-- RESET at the end restores the default. Safe to leave if migration fails mid-way —
-- the connection is closed after a failed migration.
SET statement_timeout = '0';

-- ─── Step 1: SMA-50, SMA-150, SMA-200 ──────────────────────────────────────────
-- Window functions over all rows per symbol. Timeout disabled above — expect 2-5 min.

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
-- Arithmetic-only: uses pre-stored week_52_high, week_52_low, avg_volume_20d.
-- No window functions — fast single-pass scan.
-- Rows where the underlying columns are NULL produce NULL output (see header comment).

UPDATE daily_ohlcv
SET
    volume_ratio = CASE
                       WHEN avg_volume_20d IS NOT NULL AND avg_volume_20d > 0
                       THEN ROUND(volume::numeric / avg_volume_20d, 4)
                   END,
    w52h_pct     = CASE
                       WHEN week_52_high IS NOT NULL AND week_52_high > 0
                       THEN ROUND((close - week_52_high) / week_52_high * 100.0, 4)
                   END,
    w52l_pct     = CASE
                       WHEN week_52_low IS NOT NULL AND week_52_low > 0
                       THEN ROUND((close - week_52_low) / week_52_low * 100.0, 4)
                   END
WHERE volume_ratio IS NULL
   OR w52h_pct    IS NULL
   OR w52l_pct    IS NULL;

-- ─── Step 3: rs_rating (1–99, Minervini scale) ────────────────────────────────
--
-- RS = PERCENT_RANK() of 1-year price momentum relative to all symbols on same date.
-- Momentum = (close_today - close_252d_ago) / close_252d_ago.
-- Scaled 1–99: ROUND(PERCENT_RANK() * 98 + 1).
--   Lowest-ranked stock  → ROUND(0.00 * 98 + 1) = 1
--   Highest-ranked stock → ROUND(1.00 * 98 + 1) = 99
--   70th-percentile stock → ROUND(0.70 * 98 + 1) = ROUND(69.6) = 70
-- LAG(close, 252) produces NULL for symbols with fewer than 252 prior rows.
-- With 256 dates of history, the last 4 dates per symbol receive a valid rs_rating.

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

RESET statement_timeout;

-- ─── Step 4: RPC for ongoing daily rs_rating computation ─────────────────────
--
-- Called by bhavcopy.py after each ingest to compute rs_rating for the new date.
-- SECURITY DEFINER so the service role can call it without direct table grants.
-- Uses LAG(close, 252) scoped to dates <= p_trade_date so window is consistent.
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
