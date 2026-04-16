-- Add foreign key from daily_ohlcv.symbol → stock_universe.symbol
-- Required for PostgREST to resolve the stock_universe!inner join used by the scanner.
ALTER TABLE public.daily_ohlcv
  ADD CONSTRAINT fk_daily_ohlcv_symbol
  FOREIGN KEY (symbol)
  REFERENCES public.stock_universe(symbol)
  ON DELETE CASCADE;
