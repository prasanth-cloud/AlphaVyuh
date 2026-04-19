"use client";

import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickSeriesOptions,
  type Time,
  type LogicalRange,
} from "lightweight-charts";
import type { CandleBar } from "@/lib/api";

export type LinePoint = { time: string; value: number };
export type MACDPoint = { time: string; macd: number | null; signal: number | null; histogram: number | null };
export type BBPoint = { time: string; upper: number | null; mid: number | null; lower: number | null };
export type IchimokuPoint = {
  time: string;
  tenkan: number | null; kijun: number | null;
  senkou_a: number | null; senkou_b: number | null;
  chikou: number | null;
};

export type IndicatorData = {
  ema20?: LinePoint[];
  ema50?: LinePoint[];
  ema200?: LinePoint[];
  vwap?: LinePoint[];
  bb?: BBPoint[];
  ichimoku?: IchimokuPoint[];
};

export type ChartHandle = {
  syncRange: (range: LogicalRange | null) => void;
  updateLegend: (cb: (bar: CandleBar | null) => void) => void;
  coordinateToPrice: (y: number) => number | null;
  coordinateToTime: (x: number) => string | null;
  priceToCoordinate: (price: number) => number | null;
  timeToCoordinate: (time: string) => number | null;
};

type Props = {
  candles: CandleBar[];
  indicators: IndicatorData;
  activeIndicators: string[];
  onCrosshairMove?: (bar: CandleBar | null) => void;
  onRangeChange?: (range: LogicalRange | null) => void;
  onReady?: (handle: ChartHandle) => void;
};

function candleToVolColor(c: CandleBar): string {
  return c.close >= c.open ? "#26a65b22" : "#e5383b22";
}

const CandlestickChart = forwardRef<ChartHandle, Props>(function CandlestickChart(
  { candles, indicators, activeIndicators, onCrosshairMove, onRangeChange, onReady },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<{
    candle: ISeriesApi<"Candlestick"> | null;
    volume: ISeriesApi<"Histogram"> | null;
    ema20: ISeriesApi<"Line"> | null;
    ema50: ISeriesApi<"Line"> | null;
    ema200: ISeriesApi<"Line"> | null;
    vwap: ISeriesApi<"Line"> | null;
    bbUpper: ISeriesApi<"Line"> | null;
    bbMid: ISeriesApi<"Line"> | null;
    bbLower: ISeriesApi<"Line"> | null;
    ichiTenkan: ISeriesApi<"Line"> | null;
    ichiKijun: ISeriesApi<"Line"> | null;
    ichiSenkouA: ISeriesApi<"Line"> | null;
    ichiSenkouB: ISeriesApi<"Line"> | null;
    ichiChikou: ISeriesApi<"Line"> | null;
  }>({
    candle: null, volume: null, ema20: null, ema50: null, ema200: null,
    vwap: null, bbUpper: null, bbMid: null, bbLower: null,
    ichiTenkan: null, ichiKijun: null, ichiSenkouA: null, ichiSenkouB: null, ichiChikou: null,
  });

  useImperativeHandle(ref, () => ({
    syncRange: (range) => {
      if (range && chartRef.current) {
        chartRef.current.timeScale().setVisibleLogicalRange(range);
      }
    },
    updateLegend: () => {},
    coordinateToPrice: (y) => {
      if (!seriesRef.current.candle) return null;
      const v = seriesRef.current.candle.coordinateToPrice(y);
      return v != null ? v : null;
    },
    coordinateToTime: (x) => {
      if (!chartRef.current) return null;
      const t = chartRef.current.timeScale().coordinateToTime(x);
      return t != null ? String(t) : null;
    },
    priceToCoordinate: (price) => {
      if (!seriesRef.current.candle) return null;
      const v = seriesRef.current.candle.priceToCoordinate(price);
      return v != null ? v : null;
    },
    timeToCoordinate: (time) => {
      if (!chartRef.current) return null;
      const v = chartRef.current.timeScale().timeToCoordinate(time as Time);
      return v != null ? v : null;
    },
  }));

  // Build chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0D0F14" },
        textColor: "rgba(255,255,255,0.35)",
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)", style: 1 },
        horzLines: { color: "rgba(255,255,255,0.04)", style: 1 },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(255,255,255,0.2)", width: 1, style: 3 },
        horzLine: { color: "rgba(255,255,255,0.2)", width: 1, style: 3 },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.07)",
        scaleMargins: { top: 0.08, bottom: 0.22 },
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.07)",
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false, mouseWheel: true, pressedMouseMove: true },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    chartRef.current = chart;

    // Candlestick series
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: "#26a65b",
      downColor: "#e5383b",
      borderUpColor: "#26a65b",
      borderDownColor: "#e5383b",
      wickUpColor: "#26a65b",
      wickDownColor: "#e5383b",
    } as Partial<CandlestickSeriesOptions>);
    seriesRef.current.candle = candle;

    // Volume histogram (overlay on same pane, bottom 20%)
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    chart.priceScale("vol").applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });
    seriesRef.current.volume = volume;

    // EMA lines
    seriesRef.current.ema20 = chart.addSeries(LineSeries, {
      color: "#5b63f5", lineWidth: 2, priceLineVisible: false, lastValueVisible: false,
    });
    seriesRef.current.ema50 = chart.addSeries(LineSeries, {
      color: "#d97706", lineWidth: 2, priceLineVisible: false, lastValueVisible: false,
    });
    seriesRef.current.ema200 = chart.addSeries(LineSeries, {
      color: "#e5383b", lineWidth: 2, priceLineVisible: false, lastValueVisible: false,
    });

    // VWAP
    seriesRef.current.vwap = chart.addSeries(LineSeries, {
      color: "#7c6af0", lineWidth: 2, lineStyle: 1, priceLineVisible: false, lastValueVisible: false,
    });

    // BB bands
    seriesRef.current.bbUpper = chart.addSeries(LineSeries, {
      color: "#aaaaaa", lineWidth: 1, lineStyle: 1, priceLineVisible: false, lastValueVisible: false,
    });
    seriesRef.current.bbMid = chart.addSeries(LineSeries, {
      color: "#cccccc", lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
    });
    seriesRef.current.bbLower = chart.addSeries(LineSeries, {
      color: "#aaaaaa", lineWidth: 1, lineStyle: 1, priceLineVisible: false, lastValueVisible: false,
    });

    // Ichimoku lines
    seriesRef.current.ichiTenkan = chart.addSeries(LineSeries, {
      color: "#e5383b", lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
    });
    seriesRef.current.ichiKijun = chart.addSeries(LineSeries, {
      color: "#5b63f5", lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
    });
    seriesRef.current.ichiSenkouA = chart.addSeries(LineSeries, {
      color: "#26a65b88", lineWidth: 1, lineStyle: 1, priceLineVisible: false, lastValueVisible: false,
    });
    seriesRef.current.ichiSenkouB = chart.addSeries(LineSeries, {
      color: "#e5383b88", lineWidth: 1, lineStyle: 1, priceLineVisible: false, lastValueVisible: false,
    });
    seriesRef.current.ichiChikou = chart.addSeries(LineSeries, {
      color: "#d97706", lineWidth: 1, lineStyle: 3, priceLineVisible: false, lastValueVisible: false,
    });

    // ResizeObserver
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        chart.applyOptions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    ro.observe(containerRef.current);

    // Expose handle via onReady callback (reliable alternative to ref forwarding through dynamic())
    if (onReady) {
      onReady({
        syncRange: (range) => {
          if (range) chart.timeScale().setVisibleLogicalRange(range);
        },
        updateLegend: () => {},
        coordinateToPrice: (y) => {
          const v = seriesRef.current.candle?.coordinateToPrice(y);
          return v != null ? v : null;
        },
        coordinateToTime: (x) => {
          const t = chart.timeScale().coordinateToTime(x);
          return t != null ? String(t) : null;
        },
        priceToCoordinate: (price) => {
          const v = seriesRef.current.candle?.priceToCoordinate(price);
          return v != null ? v : null;
        },
        timeToCoordinate: (time) => {
          const v = chart.timeScale().timeToCoordinate(time as Time);
          return v != null ? v : null;
        },
      });
    }

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Feed candle + volume data
  useEffect(() => {
    const s = seriesRef.current;
    if (!s.candle || !s.volume || !candles.length) return;

    s.candle.setData(
      candles.map(c => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close }))
    );
    s.volume.setData(
      candles.map(c => ({ time: c.time as Time, value: c.volume, color: candleToVolColor(c) }))
    );
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  // Crosshair move → notify parent
  useEffect(() => {
    if (!chartRef.current || !onCrosshairMove) return;
    const handler = (param: { time?: Time; seriesData?: Map<ISeriesApi<"Candlestick">, unknown> }) => {
      if (!param.time || !seriesRef.current.candle) {
        onCrosshairMove(null);
        return;
      }
      const d = param.seriesData?.get(seriesRef.current.candle) as
        | { open: number; high: number; low: number; close: number }
        | undefined;
      if (!d) { onCrosshairMove(null); return; }
      const timeStr = typeof param.time === "string" ? param.time : String(param.time);
      const vol = candles.find(c => c.time === timeStr)?.volume ?? 0;
      onCrosshairMove({ time: timeStr, open: d.open, high: d.high, low: d.low, close: d.close, volume: vol });
    };
    chartRef.current.subscribeCrosshairMove(handler as never);
    return () => chartRef.current?.unsubscribeCrosshairMove(handler as never);
  }, [candles, onCrosshairMove]);

  // Time range change → notify parent for sync
  useEffect(() => {
    if (!chartRef.current || !onRangeChange) return;
    const handler = (range: LogicalRange | null) => onRangeChange(range);
    chartRef.current.timeScale().subscribeVisibleLogicalRangeChange(handler);
    return () => chartRef.current?.timeScale().unsubscribeVisibleLogicalRangeChange(handler);
  }, [onRangeChange]);

  // Update indicator visibility + data
  useEffect(() => {
    const s = seriesRef.current;

    // EMA 20
    const showEma20 = activeIndicators.includes("ema20");
    s.ema20?.applyOptions({ visible: showEma20 });
    if (showEma20 && indicators.ema20?.length) {
      s.ema20?.setData(indicators.ema20.map(p => ({ time: p.time as Time, value: p.value })));
    }

    // EMA 50
    const showEma50 = activeIndicators.includes("ema50");
    s.ema50?.applyOptions({ visible: showEma50 });
    if (showEma50 && indicators.ema50?.length) {
      s.ema50?.setData(indicators.ema50.map(p => ({ time: p.time as Time, value: p.value })));
    }

    // EMA 200
    const showEma200 = activeIndicators.includes("ema200");
    s.ema200?.applyOptions({ visible: showEma200 });
    if (showEma200 && indicators.ema200?.length) {
      s.ema200?.setData(indicators.ema200.map(p => ({ time: p.time as Time, value: p.value })));
    }

    // VWAP
    const showVwap = activeIndicators.includes("vwap");
    s.vwap?.applyOptions({ visible: showVwap });
    if (showVwap && indicators.vwap?.length) {
      s.vwap?.setData(indicators.vwap.map(p => ({ time: p.time as Time, value: p.value })));
    }

    // BB
    const showBB = activeIndicators.includes("bb");
    s.bbUpper?.applyOptions({ visible: showBB });
    s.bbMid?.applyOptions({ visible: showBB });
    s.bbLower?.applyOptions({ visible: showBB });
    if (showBB && indicators.bb?.length) {
      const upper = indicators.bb.filter(p => p.upper != null).map(p => ({ time: p.time as Time, value: p.upper! }));
      const mid = indicators.bb.filter(p => p.mid != null).map(p => ({ time: p.time as Time, value: p.mid! }));
      const lower = indicators.bb.filter(p => p.lower != null).map(p => ({ time: p.time as Time, value: p.lower! }));
      if (upper.length) s.bbUpper?.setData(upper);
      if (mid.length) s.bbMid?.setData(mid);
      if (lower.length) s.bbLower?.setData(lower);
    }

    // Ichimoku
    const showIchi = activeIndicators.includes("ichimoku");
    s.ichiTenkan?.applyOptions({ visible: showIchi });
    s.ichiKijun?.applyOptions({ visible: showIchi });
    s.ichiSenkouA?.applyOptions({ visible: showIchi });
    s.ichiSenkouB?.applyOptions({ visible: showIchi });
    s.ichiChikou?.applyOptions({ visible: showIchi });
    if (showIchi && indicators.ichimoku?.length) {
      const ichi = indicators.ichimoku;
      const toLine = (key: keyof typeof ichi[0]) =>
        ichi.filter(p => p[key] != null).map(p => ({ time: p.time as Time, value: p[key] as number }));
      s.ichiTenkan?.setData(toLine("tenkan"));
      s.ichiKijun?.setData(toLine("kijun"));
      s.ichiSenkouA?.setData(toLine("senkou_a"));
      s.ichiSenkouB?.setData(toLine("senkou_b"));
      s.ichiChikou?.setData(toLine("chikou"));
    }
  }, [indicators, activeIndicators]);

  return <div ref={containerRef} className="w-full h-full" />;
});

export default CandlestickChart;
