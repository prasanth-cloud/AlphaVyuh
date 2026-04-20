-- Migration 016: data pipeline support tables and views
-- ingest_runs: logs every daily_refresh.py execution
-- data_health: live view of data freshness for the health endpoint
-- corporate_actions: splits, dividends, bonuses synced weekly

-- ── ingest_runs ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ingest_runs (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id      text        UNIQUE,
  started_at  timestamptz NOT NULL,
  duration_s  numeric,
  event_count integer,
  error_count integer,
  errors      jsonb,
  meta        jsonb,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ingest_runs_started ON public.ingest_runs(started_at DESC);

-- ── data_health view ─────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.data_health AS
SELECT
  (SELECT MAX(trade_date) FROM daily_ohlcv)                                                         AS latest_trade_date,
  (SELECT COUNT(*) FROM daily_ohlcv)                                                                 AS total_rows,
  (SELECT COUNT(DISTINCT symbol)
     FROM daily_ohlcv
    WHERE trade_date = (SELECT MAX(trade_date) FROM daily_ohlcv))                                    AS symbols_latest,
  (SELECT COUNT(*) FROM stock_universe WHERE is_active = true)                                       AS universe_active,
  (SELECT COUNT(*)
     FROM daily_ohlcv
    WHERE trade_date = (SELECT MAX(trade_date) FROM daily_ohlcv)
      AND rsi_14 IS NULL)                                                                            AS null_rsi_latest,
  (SELECT COUNT(*)
     FROM daily_ohlcv
    WHERE trade_date = (SELECT MAX(trade_date) FROM daily_ohlcv)
      AND ema_200 IS NULL)                                                                           AS null_ema200_latest,
  EXTRACT(EPOCH FROM (NOW() - (SELECT started_at FROM ingest_runs ORDER BY started_at DESC LIMIT 1)))
    / 3600                                                                                           AS hours_since_last_run,
  (SELECT run_id FROM ingest_runs ORDER BY started_at DESC LIMIT 1)                                 AS last_run_id,
  (SELECT error_count FROM ingest_runs ORDER BY started_at DESC LIMIT 1)                            AS last_run_errors;

-- ── corporate_actions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.corporate_actions (
  id          uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol      text    NOT NULL,
  action_date date    NOT NULL,
  action_type text    NOT NULL CHECK (action_type IN ('split', 'bonus', 'dividend', 'rights')),
  ratio       numeric,
  details     text,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (symbol, action_date, action_type)
);

CREATE INDEX IF NOT EXISTS corp_actions_symbol ON public.corporate_actions(symbol, action_date DESC);
