import { useCallback, useEffect, useRef, useState } from "react";
import type { IndicatorData, IchimokuPoint } from "@/components/charts/CandlestickChart";
import type { CandleBar, CandlesResponse } from "@/lib/api/types";
import {
  getCandles,
  getCandlesLive,
  getIndicators,
} from "@/lib/api";
import { describeMarketDataError } from "@/lib/data-errors";
import {
  getCoverageAvailabilityMessage,
  getRangeAvailabilityMessage,
  getWatchlistChartRequest,
  type WatchlistChartTimeframe,
} from "@/lib/watchlist-chart-range";

type LinePoint = { time: string; value: number };
type MACDPoint = { time: string; macd: number | null; signal: number | null; histogram: number | null };
type StochPoint = { time: string; k: number; d: number | null };

type ChartDataCacheEntry = {
  data: CandlesResponse;
  indicatorData: IndicatorData;
  rsiData: LinePoint[];
  macdData: MACDPoint[];
  stochData: StochPoint[];
  atrData: LinePoint[];
  loadedAt: number;
};

const chartDataCache = new Map<string, ChartDataCacheEntry>();
const CHART_CACHE_TTL_MS = 60_000;

const CANDLE_EMA_FIELDS = {
  ema20: "ema_20",
  ema50: "ema_50",
  ema200: "ema_200",
} as const;

function computeSmaLine(candles: CandleBar[], period: number): LinePoint[] {
  const out: LinePoint[] = [];
  let sum = 0;
  for (let index = 0; index < candles.length; index += 1) {
    sum += candles[index].close;
    if (index >= period) sum -= candles[index - period].close;
    if (index + 1 >= period) {
      out.push({ time: candles[index].time, value: Number((sum / period).toFixed(4)) });
    }
  }
  return out;
}

function computePrecomputedEmaLine(
  candles: CandleBar[],
  field: (typeof CANDLE_EMA_FIELDS)[keyof typeof CANDLE_EMA_FIELDS],
): LinePoint[] {
  const out: LinePoint[] = [];
  for (const candle of candles) {
    const value = candle[field];
    if (value == null || !Number.isFinite(value)) continue;
    out.push({ time: candle.time, value });
  }
  return out;
}

function buildCandleEmaIndicatorPayload(
  symbol: string,
  candles: CandleBar[],
  indicators: string[],
): Awaited<ReturnType<typeof getIndicators>> {
  const payload: Record<string, LinePoint[]> = {};
  for (const indicator of indicators) {
    const field = CANDLE_EMA_FIELDS[indicator as keyof typeof CANDLE_EMA_FIELDS];
    if (!field) continue;
    payload[indicator] = computePrecomputedEmaLine(candles, field);
  }
  return { symbol, indicators: payload };
}

function canUsePrecomputedCandleEmas(
  liveMode: boolean,
  timeframe: string,
  indicators: string[],
): boolean {
  return (
    !liveMode &&
    timeframe === "D" &&
    indicators.length > 0 &&
    indicators.every((indicator) => indicator in CANDLE_EMA_FIELDS)
  );
}

function applyIndicatorPayload(
  resp: Awaited<ReturnType<typeof getIndicators>> | null,
  candles: CandleBar[] = [],
) {
  const ind = (resp?.indicators ?? {}) as Record<string, unknown[]>;
  const nextIndicatorData: IndicatorData = {
    ema20: ind.ema20 as LinePoint[] | undefined,
    ema50: ind.ema50 as LinePoint[] | undefined,
    ema200: ind.ema200 as LinePoint[] | undefined,
    sma50: computeSmaLine(candles, 50),
    sma200: computeSmaLine(candles, 200),
    vwap: ind.vwap as LinePoint[] | undefined,
    bb: ind.bb as never,
    ichimoku: ind.ichimoku as IchimokuPoint[] | undefined,
  };
  const nextRsi = (ind.rsi as LinePoint[] | undefined) ?? [];
  const nextMacd = (ind.macd as MACDPoint[] | undefined) ?? [];
  const nextStoch = (ind.stoch as StochPoint[] | undefined) ?? [];
  const nextAtr = (ind.atr as LinePoint[] | undefined) ?? [];

  return { nextIndicatorData, nextRsi, nextMacd, nextStoch, nextAtr };
}

export type UseChartDataOptions = {
  symbol: string;
  rangeLabel: WatchlistChartTimeframe;
  timeframe: "D" | "W" | "M";
  setTimeframe: (timeframe: "D" | "W" | "M") => void;
  liveMode: boolean;
  setLiveMode: (live: boolean) => void;
  activeIndicators: string[];
  onLegendReset?: () => void;
};

export function useChartData({
  symbol,
  rangeLabel,
  timeframe,
  setTimeframe,
  liveMode,
  setLiveMode,
  activeIndicators,
  onLegendReset,
}: UseChartDataOptions) {
  const [data, setData] = useState<CandlesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [indicatorData, setIndicatorData] = useState<IndicatorData>({});
  const [indicatorError, setIndicatorError] = useState<string | null>(null);
  const [rsiData, setRsiData] = useState<LinePoint[]>([]);
  const [macdData, setMacdData] = useState<MACDPoint[]>([]);
  const [stochData, setStochData] = useState<StochPoint[]>([]);
  const [atrData, setAtrData] = useState<LinePoint[]>([]);
  const [rangeNote, setRangeNote] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const dataRef = useRef<CandlesResponse | null>(null);
  const lastBaseChartKeyRef = useRef<string | null>(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const refresh = useCallback(() => {
    setRefreshNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const request = getWatchlistChartRequest(rangeLabel);
    if (request.timeframe !== timeframe) setTimeframe(request.timeframe);
    const overlayInds = activeIndicators.filter((indicator) => ["ema20", "ema50", "ema200", "bb", "vwap"].includes(indicator));
    const panelInds = activeIndicators.filter((indicator) => ["rsi", "macd"].includes(indicator));
    const allInds = Array.from(new Set([...overlayInds, ...panelInds]));
    const baseCacheKey = [symbol, rangeLabel, request.timeframe, request.from_date, request.to_date, request.limit, liveMode ? "live" : "eod"].join(":");
    const cacheKey = [baseCacheKey, allInds.sort().join(",")].join(":");
    const cached = chartDataCache.get(cacheKey);
    const freshCached = cached && Date.now() - cached.loadedAt < CHART_CACHE_TTL_MS ? cached : null;
    const canKeepVisibleChart = dataRef.current && lastBaseChartKeyRef.current === baseCacheKey;

    setLoading(true);
    setError("");
    if (freshCached) {
      setData(freshCached.data);
      lastBaseChartKeyRef.current = baseCacheKey;
      onLegendReset?.();
      setRangeNote(getCoverageAvailabilityMessage(freshCached.data.coverage, request) ?? getRangeAvailabilityMessage(freshCached.data.candles ?? [], request));
      setIndicatorError(null);
      setIndicatorData(freshCached.indicatorData);
      setRsiData(freshCached.rsiData);
      setMacdData(freshCached.macdData);
      setStochData(freshCached.stochData);
      setAtrData(freshCached.atrData);
    } else if (canKeepVisibleChart) {
      setRangeNote(null);
      setIndicatorData({});
      setRsiData([]);
      setMacdData([]);
      setStochData([]);
      setAtrData([]);
    } else {
      setData(null);
      setRangeNote(null);
      setRsiData([]);
      setMacdData([]);
      setStochData([]);
      setAtrData([]);
      setIndicatorData({});
    }
    if (!allInds.length) setIndicatorError(null);

    const candlesParams = {
      limit: request.limit,
      timeframe: request.timeframe,
      from_date: request.from_date,
      to_date: request.to_date,
    };
    const usePrecomputedEmas = canUsePrecomputedCandleEmas(liveMode, request.timeframe, allInds);
    const candlesPromise = liveMode
      ? getCandlesLive(symbol, { limit: Math.min(request.limit, 1000), timeframe: request.timeframe }).catch(() => {
          if (!cancelled) setLiveMode(false);
          return getCandles(symbol, candlesParams);
        })
      : getCandles(symbol, candlesParams);
    const indicatorsPromise = allInds.length && !usePrecomputedEmas
      ? getIndicators(symbol, allInds, request.timeframe)
        .then((payload) => ({ payload, error: null as string | null }))
        .catch((indicatorLoadError) => ({
          payload: null,
          error: indicatorLoadError instanceof Error && indicatorLoadError.message.trim()
            ? indicatorLoadError.message
            : "Chart indicators are temporarily unavailable.",
        }))
      : Promise.resolve({ payload: null, error: null as string | null });

    Promise.all([candlesPromise, indicatorsPromise])
      .then(([nextData, indicatorsResp]) => {
        if (cancelled) return;
        setData(nextData);
        lastBaseChartKeyRef.current = baseCacheKey;
        onLegendReset?.();
        setRangeNote(getCoverageAvailabilityMessage(nextData.coverage, request) ?? getRangeAvailabilityMessage(nextData.candles ?? [], request));
        setIndicatorError(indicatorsResp.error);
        const indicatorPayload = usePrecomputedEmas
          ? buildCandleEmaIndicatorPayload(symbol, nextData.candles ?? [], allInds)
          : indicatorsResp.payload;
        const { nextIndicatorData, nextRsi, nextMacd, nextStoch, nextAtr } = applyIndicatorPayload(indicatorPayload, nextData.candles ?? []);
        setIndicatorData(nextIndicatorData);
        setRsiData(nextRsi);
        setMacdData(nextMacd);
        setStochData(nextStoch);
        setAtrData(nextAtr);
        if (!indicatorsResp.error) {
          chartDataCache.set(cacheKey, {
            data: nextData,
            indicatorData: nextIndicatorData,
            rsiData: nextRsi,
            macdData: nextMacd,
            stochData: nextStoch,
            atrData: nextAtr,
            loadedAt: Date.now(),
          });
        }
      })
      .catch((loadError) => {
        if (!cancelled) setError(describeMarketDataError(loadError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeIndicators, liveMode, onLegendReset, rangeLabel, refreshNonce, setLiveMode, setTimeframe, symbol, timeframe]);

  useEffect(() => {
    if (!liveMode) return;
    const interval = setInterval(() => {
      const request = getWatchlistChartRequest(rangeLabel);
      getCandlesLive(symbol, { limit: Math.min(request.limit, 1000), timeframe: request.timeframe })
        .then((nextData) => {
          setData(nextData);
          onLegendReset?.();
        })
        .catch(() => {});
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [liveMode, onLegendReset, rangeLabel, symbol]);

  return {
    data,
    loading,
    error,
    indicatorData,
    rsiData,
    macdData,
    stochData,
    atrData,
    rangeNote,
    indicatorError,
    refresh,
  };
}
