-- Migration 018: Add extended indicator columns to daily_ohlcv
-- MACD, Bollinger Bands, Stochastic, ADX, CCI, Williams %R, OBV, VWAP,
-- delivery_pct, pct_change, gap_pct, candle pattern flags

ALTER TABLE public.daily_ohlcv
  ADD COLUMN IF NOT EXISTS pct_change      numeric(8,4),
  ADD COLUMN IF NOT EXISTS gap_pct         numeric(8,4),
  ADD COLUMN IF NOT EXISTS macd_line       numeric(10,4),
  ADD COLUMN IF NOT EXISTS macd_signal     numeric(10,4),
  ADD COLUMN IF NOT EXISTS macd_hist       numeric(10,4),
  ADD COLUMN IF NOT EXISTS bb_upper        numeric(12,2),
  ADD COLUMN IF NOT EXISTS bb_middle       numeric(12,2),
  ADD COLUMN IF NOT EXISTS bb_lower        numeric(12,2),
  ADD COLUMN IF NOT EXISTS bb_width        numeric(8,4),
  ADD COLUMN IF NOT EXISTS stoch_k         numeric(6,2),
  ADD COLUMN IF NOT EXISTS stoch_d         numeric(6,2),
  ADD COLUMN IF NOT EXISTS adx_14          numeric(6,2),
  ADD COLUMN IF NOT EXISTS cci_20          numeric(10,2),
  ADD COLUMN IF NOT EXISTS williams_r      numeric(8,2),
  ADD COLUMN IF NOT EXISTS obv             bigint,
  ADD COLUMN IF NOT EXISTS vwap            numeric(12,2),
  ADD COLUMN IF NOT EXISTS delivery_pct    numeric(6,2),
  ADD COLUMN IF NOT EXISTS is_new_52w_high boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_new_52w_low  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_inside_bar   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_outside_bar  boolean DEFAULT false;

-- Indexes for common filter patterns
CREATE INDEX IF NOT EXISTS idx_ohlcv_pct_change  ON public.daily_ohlcv(pct_change);
CREATE INDEX IF NOT EXISTS idx_ohlcv_macd_hist   ON public.daily_ohlcv(macd_hist)  WHERE macd_hist IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ohlcv_adx         ON public.daily_ohlcv(adx_14)     WHERE adx_14 IS NOT NULL;
