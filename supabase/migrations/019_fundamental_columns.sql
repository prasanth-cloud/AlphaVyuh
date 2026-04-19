ALTER TABLE public.stock_universe
  ADD COLUMN IF NOT EXISTS market_cap_cr    float,
  ADD COLUMN IF NOT EXISTS pe_ratio         float,
  ADD COLUMN IF NOT EXISTS pb_ratio         float,
  ADD COLUMN IF NOT EXISTS eps              float,
  ADD COLUMN IF NOT EXISTS dividend_yield   float,
  ADD COLUMN IF NOT EXISTS debt_to_equity   float,
  ADD COLUMN IF NOT EXISTS roe              float,
  ADD COLUMN IF NOT EXISTS roce             float,
  ADD COLUMN IF NOT EXISTS revenue_cr       float,
  ADD COLUMN IF NOT EXISTS net_profit_cr    float,
  ADD COLUMN IF NOT EXISTS face_value       float,
  ADD COLUMN IF NOT EXISTS book_value       float,
  ADD COLUMN IF NOT EXISTS fundamentals_updated_at timestamptz;
