-- Migration 031: M3-E — momentum, supertrend, and prev_macd_hist columns
--
-- These five columns are precomputed at ingest time (or backfilled) and make
-- the corresponding ScanFilters conditions FREE (WHERE clause, no Python CTE):
--   momentum_5d/10d/20d  → pct_change_5d_min/max, pct_change_10d_min/max, etc.
--   supertrend_direction → supertrend_signal filter
--   prev_macd_hist       → macd_signal "bullish_cross" / "bearish_cross" (CHEAP)
--
-- All columns are nullable — existing rows are unaffected. The backfill script
-- backend/scripts/backfill_momentum_supertrend.py populates historical rows.
--
-- Note: daily_ohlcv uses NOT split-adjusted NSE bhavcopy close prices.
-- Momentum values across corporate action dates will show artifacts.
-- Disclosed to users in the scanner UI; see ADR 006 §Decision 4.
--
-- ADR 006 §Decision 4 — see docs/decisions/006-m3-filter-scope.md

ALTER TABLE public.daily_ohlcv
  ADD COLUMN IF NOT EXISTS momentum_5d          numeric(8,4),
  ADD COLUMN IF NOT EXISTS momentum_10d         numeric(8,4),
  ADD COLUMN IF NOT EXISTS momentum_20d         numeric(8,4),
  ADD COLUMN IF NOT EXISTS supertrend_direction smallint,      -- 1=bullish, -1=bearish, 0=insufficient
  ADD COLUMN IF NOT EXISTS prev_macd_hist       numeric(12,6);

-- Indexes: momentum and supertrend are push-filterable (FREE), so composite
-- (trade_date, col) indexes let Postgres satisfy both conditions with one scan.

CREATE INDEX IF NOT EXISTS idx_ohlcv_date_momentum_5d
  ON public.daily_ohlcv (trade_date DESC, momentum_5d)
  WHERE momentum_5d IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ohlcv_date_momentum_10d
  ON public.daily_ohlcv (trade_date DESC, momentum_10d)
  WHERE momentum_10d IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ohlcv_date_momentum_20d
  ON public.daily_ohlcv (trade_date DESC, momentum_20d)
  WHERE momentum_20d IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ohlcv_date_supertrend
  ON public.daily_ohlcv (trade_date DESC, supertrend_direction)
  WHERE supertrend_direction IS NOT NULL;

-- prev_macd_hist: not indexed — only used for Python-side cross detection (CHEAP),
-- no DB-push WHERE clause needed.
