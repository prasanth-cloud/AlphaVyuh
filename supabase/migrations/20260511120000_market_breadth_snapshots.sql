-- Precomputed daily market breadth read model for fast dashboard first paint.
-- Built after EOD ingest; read by /api/v1/market/overview before falling back
-- to on-demand daily_ohlcv scans.

CREATE TABLE IF NOT EXISTS public.market_breadth_snapshots (
  trade_date date PRIMARY KEY,
  advances integer NOT NULL DEFAULT 0,
  declines integer NOT NULL DEFAULT 0,
  unchanged integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  advance_decline_ratio numeric,
  new_52w_highs integer NOT NULL DEFAULT 0,
  new_52w_lows integer NOT NULL DEFAULT 0,
  above_ema20_count integer NOT NULL DEFAULT 0,
  above_ema20_pct numeric,
  above_ema50_count integer NOT NULL DEFAULT 0,
  above_ema50_pct numeric,
  above_ema200_count integer NOT NULL DEFAULT 0,
  above_ema200_pct numeric,
  market_phase text,
  market_phase_desc text,
  sector_breadth jsonb NOT NULL DEFAULT '[]'::jsonb,
  top_sectors jsonb NOT NULL DEFAULT '[]'::jsonb,
  top_gainers jsonb NOT NULL DEFAULT '[]'::jsonb,
  top_losers jsonb NOT NULL DEFAULT '[]'::jsonb,
  most_active jsonb NOT NULL DEFAULT '[]'::jsonb,
  coverage_pct numeric,
  universe_active integer,
  source_name text NOT NULL DEFAULT 'latest_complete_nse_eq_universe',
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS market_breadth_snapshots_generated_at_idx
  ON public.market_breadth_snapshots (generated_at DESC);

ALTER TABLE public.market_breadth_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS market_breadth_snapshots_read ON public.market_breadth_snapshots;
CREATE POLICY market_breadth_snapshots_read
  ON public.market_breadth_snapshots
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS market_breadth_snapshots_service_role ON public.market_breadth_snapshots;
CREATE POLICY market_breadth_snapshots_service_role
  ON public.market_breadth_snapshots
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_market_breadth_snapshots_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_market_breadth_snapshots_updated_at
  ON public.market_breadth_snapshots;
CREATE TRIGGER set_market_breadth_snapshots_updated_at
  BEFORE UPDATE ON public.market_breadth_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.set_market_breadth_snapshots_updated_at();
