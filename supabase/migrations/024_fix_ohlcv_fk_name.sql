-- Rename FK constraint to match the name expected by PostgREST queries
ALTER TABLE public.daily_ohlcv
  DROP CONSTRAINT IF EXISTS fk_daily_ohlcv_symbol;

ALTER TABLE public.daily_ohlcv
  ADD CONSTRAINT daily_ohlcv_symbol_fkey
  FOREIGN KEY (symbol) REFERENCES public.stock_universe(symbol) ON DELETE CASCADE;

SELECT pg_notify('pgrst', 'reload schema');
