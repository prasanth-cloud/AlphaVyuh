-- 033_rename_rs_rating_to_rs_score.sql
--
-- Renames the rs_rating column and related objects to rs_score, honouring
-- ADR 006 §Decision 5 ("RS Score" is the canonical name; "RS Rating" is
-- an IBD trademark; our metric is benchmarked against the NSE universe).
--
-- CHANGES
--   daily_ohlcv.rs_rating            → rs_score
--   idx_ohlcv_date_rs_rating (index) → idx_ohlcv_date_rs_score
--   compute_rs_rating_for_date RPC   → compute_rs_score_for_date
--
-- IDEMPOTENCY
--   Each step is guarded: column rename only runs if rs_rating still exists;
--   index rename only runs if the old name still exists; function drop is
--   IF EXISTS. Safe to re-run after a partial failure.
--
-- PERFORMANCE
--   ALTER TABLE … RENAME COLUMN is metadata-only (no table rewrite, instant).
--   ALTER INDEX … RENAME TO   is metadata-only (instant, no index rebuild).
--   No data is moved; no index window exists.

SET statement_timeout = '0';

-- ─── Step 1: Rename column ───────────────────────────────────────────────────

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'daily_ohlcv'
          AND column_name  = 'rs_rating'
    ) THEN
        ALTER TABLE public.daily_ohlcv RENAME COLUMN rs_rating TO rs_score;
    END IF;
END;
$$;

-- ─── Step 2: Rename index ────────────────────────────────────────────────────

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname  = 'idx_ohlcv_date_rs_rating'
    ) THEN
        ALTER INDEX public.idx_ohlcv_date_rs_rating RENAME TO idx_ohlcv_date_rs_score;
    END IF;
END;
$$;

-- ─── Step 3: Drop old RPC ────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS compute_rs_rating_for_date(date);

-- ─── Step 4: Create new RPC ──────────────────────────────────────────────────
--
-- Body is identical to the function created in 032, with rs_rating → rs_score.
-- SECURITY DEFINER so the service role can call it without direct table grants.
-- Uses LAG(close, 252) scoped to dates <= p_trade_date so window is consistent.

CREATE OR REPLACE FUNCTION compute_rs_score_for_date(p_trade_date date)
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
            END AS rs_score
        FROM momentum
        WHERE trade_date = p_trade_date
    )
    UPDATE daily_ohlcv d
    SET rs_score = r.rs_score
    FROM ranked r
    WHERE d.symbol = r.symbol
      AND d.trade_date = p_trade_date
      AND r.rs_score IS NOT NULL;
END;
$$;

RESET statement_timeout;
