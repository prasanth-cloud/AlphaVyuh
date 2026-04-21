-- Migration 029: get_vcp_lookback — Postgres CTE for VCP pass-2 data fetch
--
-- Purpose: Replace 39 sequential PostgREST batches with a single RPC call.
-- Returns one JSONB row per symbol (history packed as JSON array) so the
-- PostgREST response stays ≤ candidate count rows — never hitting the 1,000-row cap.
--
-- Security: SECURITY DEFINER is safe here because daily_ohlcv is market data
-- (not user-scoped). daily_ohlcv has no RLS restricting reads. Do NOT use
-- SECURITY DEFINER for any function that joins user-owned tables (watchlist_items,
-- trade_journal, etc.) — those must run as the caller with RLS enforced.
--
-- Called from: backend/app/routers/scanner.py _run_vcp_pass2()
-- via: client.rpc("get_vcp_lookback", {"p_symbols": [...], "p_ref_date": "YYYY-MM-DD"})
--
-- ADR 005 §Hybrid Architecture — see docs/decisions/005-scan-engine.md

CREATE OR REPLACE FUNCTION public.get_vcp_lookback(
    p_symbols   text[],
    p_ref_date  date,
    p_lookback  int  DEFAULT 75
)
RETURNS TABLE (
    symbol  text,
    history jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH recent AS (
        SELECT
            d.symbol,
            d.trade_date,
            d.high,
            d.low,
            d.close,
            d.volume,
            row_number() OVER (
                PARTITION BY d.symbol
                ORDER BY d.trade_date DESC
            ) AS rn
        FROM daily_ohlcv d
        WHERE d.symbol = ANY(p_symbols)
          AND d.trade_date <= p_ref_date
    )
    SELECT
        r.symbol,
        jsonb_agg(
            jsonb_build_object(
                'trade_date', r.trade_date,
                'high',       r.high,
                'low',        r.low,
                'close',      r.close,
                'volume',     r.volume
            )
            ORDER BY r.trade_date ASC
        ) AS history
    FROM recent r
    WHERE r.rn <= p_lookback
    GROUP BY r.symbol;
$$;

-- Grant execute to authenticated and service-role users
GRANT EXECUTE ON FUNCTION public.get_vcp_lookback(text[], date, int)
    TO authenticated, service_role;
