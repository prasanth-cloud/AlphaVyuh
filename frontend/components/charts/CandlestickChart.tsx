"use client";

import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  BarSeries,
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
  sma50?: LinePoint[];
  sma200?: LinePoint[];
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

export type ChartDisplayType = "candles" | "bars" | "line";

type Props = {
  candles: CandleBar[];
  indicators: IndicatorData;
  activeIndicators: string[];
  chartType?: ChartDisplayType;
  onCrosshairMove?: (bar: CandleBar | null) => void;
  onRangeChange?: (range: LogicalRange | null) => void;
  onReady?: (handle: ChartHandle) => void;
};

function candleToVolColor(c: CandleBar): string {
  return c.close >= c.open ? "rgba(34,197,94,0.34)" : "rgba(239,68,68,0.34)";
}

function applyDefaultVisibleRange(chart: IChartApi, candles: CandleBar[]) {
  if (!candles.length) return;
  if (candles.length <= 320) {
    chart.timeScale().fitContent();
    return;
  }
  const to = candles.length - 1;
  const visibleBars = Math.min(candles.length, 170);
  const from = Math.max(0, to - visibleBars);
  chart.timeScale().setVisibleLogicalRange({ from, to: to + 10 });
}

const CandlestickChart = forwardRef<ChartHandle, Props>(function CandlestickChart(
  { candles, indicators, activeIndicators, chartType = "candles", onCrosshairMove, onRangeChange, onReady },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const didInitialFitRef = useRef(false);
  const seriesRef = useRef<{
    price: ISeriesApi<"Candlestick"> | ISeriesApi<"Bar"> | ISeriesApi<"Line"> | null;
    volume: ISeriesApi<"Histogram"> | null;
    ema20: ISeriesApi<"Line"> | null;
    ema50: ISeriesApi<"Line"> | null;
    ema200: ISeriesApi<"Line"> | null;
    sma50: ISeriesApi<"Line"> | null;
    sma200: ISeriesApi<"Line"> | null;
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
    price: null, volume: null, ema20: null, ema50: null, ema200: null, sma50: null, sma200: null,
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
      if (!seriesRef.current.price) return null;
      const v = seriesRef.current.price.coordinateToPrice(y);
      return v != null ? v : null;
    },
    coordinateToTime: (x) => {
      if (!chartRef.current) return null;
      const t = chartRef.current.timeScale().coordinateToTime(x);
      return t != null ? String(t) : null;
    },
    priceToCoordinate: (price) => {
      if (!seriesRef.current.price) return null;
      const v = seriesRef.current.price.priceToCoordinate(price);
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
        background: { type: ColorType.Solid, color: "#05070b" },
        textColor: "rgba(209,213,219,0.72)",
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 12,
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: "rgba(148,163,184,0.08)", style: 1 },
        horzLines: { color: "rgba(148,163,184,0.08)", style: 1 },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(226,232,240,0.34)", width: 1, style: 3, labelBackgroundColor: "#111827" },
        horzLine: { color: "rgba(226,232,240,0.34)", width: 1, style: 3, labelBackgroundColor: "#111827" },
      },
      rightPriceScale: {
        borderColor: "rgba(148,163,184,0.16)",
        scaleMargins: { top: 0.06, bottom: 0.2 },
        entireTextOnly: true,
      },
      timeScale: {
        borderColor: "rgba(148,163,184,0.16)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 10,
        barSpacing: 8,
        minBarSpacing: 3,
        lockVisibleTimeRangeOnResize: true,
      },
      handleScroll: { vertTouchDrag: false, mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    chartRef.current = chart;

    const priceSeries = chartType === "bars"
      ? chart.addSeries(BarSeries, {
          upColor: "#26a65b",
          downColor: "#e5383b",
          thinBars: false,
        })
      : chartType === "line"
        ? chart.addSeries(LineSeries, {
            color: "#f4f7fb",
          lineWidth: 2,
          priceLineVisible: true,
          lastValueVisible: true,
          priceLineColor: "#f8fafc",
        })
        : chart.addSeries(CandlestickSeries, {
            upColor: "#22c55e",
            downColor: "#ef4444",
            borderUpColor: "#22c55e",
            borderDownColor: "#ef4444",
            wickUpColor: "#22c55e",
            wickDownColor: "#ef4444",
            priceLineColor: "#e5e7eb",
            priceLineVisible: true,
            lastValueVisible: true,
          } as Partial<CandlestickSeriesOptions>);
    seriesRef.current.price = priceSeries;

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
      color: "#f4f7fb", lineWidth: 2, priceLineVisible: false, lastValueVisible: false,
    });
    seriesRef.current.ema50 = chart.addSeries(LineSeries, {
      color: "#bac4d1", lineWidth: 2, priceLineVisible: false, lastValueVisible: false,
    });
    seriesRef.current.ema200 = chart.addSeries(LineSeries, {
      color: "#7a8695", lineWidth: 2, priceLineVisible: false, lastValueVisible: false,
    });
    seriesRef.current.sma50 = chart.addSeries(LineSeries, {
      color: "#94a3b8", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false,
    });
    seriesRef.current.sma200 = chart.addSeries(LineSeries, {
      color: "#64748b", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false,
    });

    // VWAP
    seriesRef.current.vwap = chart.addSeries(LineSeries, {
      color: "#d6dce5", lineWidth: 2, lineStyle: 1, priceLineVisible: false, lastValueVisible: false,
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
      color: "#d6dce5", lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
    });
    seriesRef.current.ichiKijun = chart.addSeries(LineSeries, {
      color: "#f4f7fb", lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
    });
    seriesRef.current.ichiSenkouA = chart.addSeries(LineSeries, {
      color: "#26a65b88", lineWidth: 1, lineStyle: 1, priceLineVisible: false, lastValueVisible: false,
    });
    seriesRef.current.ichiSenkouB = chart.addSeries(LineSeries, {
      color: "#e5383b88", lineWidth: 1, lineStyle: 1, priceLineVisible: false, lastValueVisible: false,
    });
    seriesRef.current.ichiChikou = chart.addSeries(LineSeries, {
      color: "#9ca3af", lineWidth: 1, lineStyle: 3, priceLineVisible: false, lastValueVisible: false,
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
          const v = seriesRef.current.price?.coordinateToPrice(y);
          return v != null ? v : null;
        },
        coordinateToTime: (x) => {
          const t = chart.timeScale().coordinateToTime(x);
          return t != null ? String(t) : null;
        },
        priceToCoordinate: (price) => {
          const v = seriesRef.current.price?.priceToCoordinate(price);
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
      didInitialFitRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartType]);

  // Feed candle + volume data
  useEffect(() => {
    const s = seriesRef.current;
    if (!s.price || !s.volume || !candles.length) return;

    const ohlcData = candles.map(c => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close }));
    const lineData = candles.map(c => ({ time: c.time as Time, value: c.close }));
    s.price.setData(chartType === "line" ? lineData : ohlcData);
    s.volume.setData(
      candles.map(c => ({ time: c.time as Time, value: c.volume, color: candleToVolColor(c) }))
    );
    s.volume.applyOptions({ visible: activeIndicators.includes("volume") });
    if (!didInitialFitRef.current) {
      if (chartRef.current) applyDefaultVisibleRange(chartRef.current, candles);
      didInitialFitRef.current = true;
    }
  }, [candles, chartType, activeIndicators]);

  // Crosshair move → notify parent
  useEffect(() => {
    if (!chartRef.current || !onCrosshairMove) return;
    const handler = (param: { time?: Time; seriesData?: Map<ISeriesApi<"Candlestick">, unknown> }) => {
      if (!param.time || !seriesRef.current.price) {
        onCrosshairMove(null);
        return;
      }
      const timeStr = typeof param.time === "string" ? param.time : String(param.time);
      const source = candles.find(c => c.time === timeStr);
      if (!source) { onCrosshairMove(null); return; }
      onCrosshairMove(source);
    };
    chartRef.current.subscribeCrosshairMove(handler as never);
    return () => chartRef.current?.unsubscribeCrosshairMove(handler as never);
  }, [candles, onCrosshairMove, chartType]);

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

    const showSma50 = activeIndicators.includes("sma50");
    s.sma50?.applyOptions({ visible: showSma50 });
    if (showSma50 && indicators.sma50?.length) {
      s.sma50?.setData(indicators.sma50.map(p => ({ time: p.time as Time, value: p.value })));
    }

    const showSma200 = activeIndicators.includes("sma200");
    s.sma200?.applyOptions({ visible: showSma200 });
    if (showSma200 && indicators.sma200?.length) {
      s.sma200?.setData(indicators.sma200.map(p => ({ time: p.time as Time, value: p.value })));
    }

    s.volume?.applyOptions({ visible: activeIndicators.includes("volume") });

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
