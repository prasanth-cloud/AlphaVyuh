-- Migration 028: Add SEPA/VCP scan columns and push-filter indexes to daily_ohlcv
--
-- Context (ADR 005): M3 scanner push-filter optimization replaces the 6,000-row
-- Python-side filter with targeted SQL WHERE clauses. These columns let the DB
-- evaluate the most selective SEPA conditions before sending rows to Python.
--
-- All new columns are nullable — they are populated by the EOD ingest job
-- (implemented in a later PR). Existing rows remain valid; scanners handle NULLs
-- as "filter does not match" (same as existing columns like rsi_14).
--
-- RLS: daily_ohlcv has RLS intentionally DISABLED. It contains public market data
-- with no user-specific rows. The backend accesses it via service-role (RLS bypass).
-- Do not enable RLS on this table without flagging the design change.

-- ── New precomputed columns ───────────────────────────────────────────────────

ALTER TABLE public.daily_ohlcv
  -- Simple moving averages (Minervini SEPA uses SMA, not EMA)
  ADD COLUMN IF NOT EXISTS sma_50        numeric(12,2),   -- 50-day SMA
  ADD COLUMN IF NOT EXISTS sma_150       numeric(12,2),   -- 150-day SMA (key for MA stack)
  ADD COLUMN IF NOT EXISTS sma_200       numeric(12,2),   -- 200-day SMA

  -- Relative Strength rating (Minervini 1-99 scale; based on 12-month price performance
  -- vs universe. Values null until ingest populates for a full year of history.)
  ADD COLUMN IF NOT EXISTS rs_rating     numeric(6,2),

  -- Precomputed ratio columns — avoids recomputing in Python on every scan row
  ADD COLUMN IF NOT EXISTS volume_ratio  numeric(8,4),    -- volume / avg_volume_20d
  ADD COLUMN IF NOT EXISTS w52h_pct      numeric(8,4),    -- (week_52_high - close) / close * 100
  ADD COLUMN IF NOT EXISTS w52l_pct      numeric(8,4);    -- (close - week_52_low) / week_52_low * 100

-- ── Composite indexes for push-filter queries ─────────────────────────────────
-- Pattern: WHERE trade_date = $1 AND <filter_col> <op> $2
-- trade_date is always in every scanner query; the composite (trade_date, col)
-- index lets Postgres satisfy both conditions with a single index scan.

-- rs_rating: most selective SEPA condition (rs_rating >= 70 passes ~20-30% of universe)
CREATE INDEX IF NOT EXISTS idx_ohlcv_date_rs_rating
  ON public.daily_ohlcv (trade_date DESC, rs_rating)
  WHERE rs_rating IS NOT NULL;

-- w52h_pct: within N% of 52-week high (distance_from_52w_high filter)
CREATE INDEX IF NOT EXISTS idx_ohlcv_date_w52h_pct
  ON public.daily_ohlcv (trade_date DESC, w52h_pct)
  WHERE w52h_pct IS NOT NULL;

-- volume_ratio: volume surge filter (volume_ratio >= 1.5 etc.)
CREATE INDEX IF NOT EXISTS idx_ohlcv_date_volume_ratio
  ON public.daily_ohlcv (trade_date DESC, volume_ratio)
  WHERE volume_ratio IS NOT NULL;

-- close: price range filter (price_min / price_max)
CREATE INDEX IF NOT EXISTS idx_ohlcv_date_close
  ON public.daily_ohlcv (trade_date DESC, close)
  WHERE close IS NOT NULL;

-- sma_150: MA stack filter (sma_50 > sma_150 > sma_200 check)
CREATE INDEX IF NOT EXISTS idx_ohlcv_date_sma150
  ON public.daily_ohlcv (trade_date DESC, sma_150)
  WHERE sma_150 IS NOT NULL;
