"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CandlestickSeries, ColorType, createChart, type CandlestickData, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import styles from "./landing.module.css";
import type { HistoryBar, HistoryResponse } from "@/lib/market/types";

function toSeriesData(bars: HistoryBar[]): CandlestickData<UTCTimestamp>[] {
  return bars.map((bar) => ({
    time: Math.floor(bar.time / 1000) as UTCTimestamp,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  }));
}

export default function HeroChart({
  symbol,
  initialData,
}: {
  symbol: string;
  initialData: HistoryResponse;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [data, setData] = useState(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [livePrice, setLivePrice] = useState<number | null>(initialData.bars.at(-1)?.close ?? null);

  const seriesData = useMemo(() => toSeriesData(data.bars), [data.bars]);
  const firstBar = data.bars[0];
  const lastBar = data.bars.at(-1);
  const dayChange = firstBar && lastBar ? lastBar.close - firstBar.open : 0;
  const dayChangePercent = firstBar && lastBar && firstBar.open !== 0 ? (dayChange / firstBar.open) * 100 : 0;
  const hi = data.bars.reduce((max, bar) => Math.max(max, bar.high), Number.NEGATIVE_INFINITY);
  const lo = data.bars.reduce((min, bar) => Math.min(min, bar.low), Number.POSITIVE_INFINITY);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const stylesRoot = getComputedStyle(document.documentElement);
    const chart = createChart(root, {
      layout: {
        background: { type: ColorType.Solid, color: stylesRoot.getPropertyValue("--surface-1").trim() || "#12151C" },
        textColor: stylesRoot.getPropertyValue("--text-tertiary").trim() || "#9F988C",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.05)" },
        horzLines: { color: "rgba(255,255,255,0.05)" },
      },
      width: root.clientWidth,
      height: root.clientHeight,
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.08)",
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { color: "rgba(86,215,193,0.18)" },
        horzLine: { color: "rgba(86,215,193,0.18)" },
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#2DB574",
      downColor: "#E15560",
      wickUpColor: "#2DB574",
      wickDownColor: "#E15560",
      borderVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    series.setData(seriesData);
    chart.timeScale().fitContent();
    seriesRef.current = series;

    const resizeObserver = new ResizeObserver(() => {
      chart.applyOptions({ width: root.clientWidth, height: root.clientHeight });
    });
    resizeObserver.observe(root);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [seriesData]);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/market/history/${encodeURIComponent(symbol)}`, { cache: "no-store" });
        if (!response.ok) return;
        const next = (await response.json()) as HistoryResponse;
        if (!cancelled) {
          setData(next);
          setLivePrice(next.bars.at(-1)?.close ?? null);
        }
      } catch {
        // quiet fallback
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    refresh();
    const id = window.setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [symbol]);

  useEffect(() => {
    if (!seriesRef.current || seriesData.length === 0) return;
    const id = window.setInterval(() => {
      const last = seriesData[seriesData.length - 1];
      if (!last) return;
      const basis = last.close;
      const drift = basis * (Math.random() * 0.002 - 0.001);
      const close = Number((basis + drift).toFixed(2));
      const high = Math.max(last.high, close);
      const low = Math.min(last.low, close);
      setLivePrice(close);
      seriesRef.current?.update({
        ...last,
        close,
        high,
        low,
      });
    }, 3000);

    return () => window.clearInterval(id);
  }, [seriesData]);

  return (
    <div className={styles.heroChartShell}>
      {isLoading && <div className={styles.heroChartSkeleton} />}
      <div className={styles.heroChartTopbar}>
        <div className={styles.heroChartTopbarLeft}>
          <span className={styles.heroChartBadge}>Scanner linked</span>
          <span className={styles.heroChartBadge}>Broker ready</span>
          <span className={styles.heroChartBadge}>Journal sync</span>
        </div>
        <div className={styles.heroChartTopbarRight}>
          <span>1D</span>
          <span>15m</span>
          <span>Indicators</span>
        </div>
      </div>
      <div className={styles.heroChartSideRail}>
        <span>+</span>
        <span>/</span>
        <span>□</span>
        <span>T</span>
      </div>
      <div ref={rootRef} className={styles.heroChartCanvas} />
      <div className={styles.heroChartMeta}>
        <span>{symbol}</span>
        <span>{data.isDemoData ? "Demo data" : "Live market feed"}</span>
      </div>
      <div className={styles.heroChartSnapshot}>
        <div>
          <span>Last</span>
          <strong>{livePrice?.toLocaleString("en-IN", { maximumFractionDigits: 2 }) ?? "--"}</strong>
        </div>
        <div>
          <span>Day</span>
          <strong className={dayChange >= 0 ? styles.heroPositive : styles.heroNegative}>
            {dayChange >= 0 ? "+" : ""}
            {dayChange.toFixed(2)} ({dayChangePercent >= 0 ? "+" : ""}
            {dayChangePercent.toFixed(2)}%)
          </strong>
        </div>
        <div>
          <span>Range</span>
          <strong>
            {Number.isFinite(lo) ? lo.toFixed(0) : "--"} - {Number.isFinite(hi) ? hi.toFixed(0) : "--"}
          </strong>
        </div>
      </div>
      <div className={styles.heroChartOrderCard}>
        <div className={styles.heroChartOrderHeader}>
          <strong>Execution plan</strong>
          <span>Setup-linked</span>
        </div>
        <div className={styles.heroChartOrderRow}>
          <span>Entry</span>
          <strong>{livePrice?.toFixed(2) ?? "--"}</strong>
        </div>
        <div className={styles.heroChartOrderRow}>
          <span>Risk</span>
          <strong>0.75R</strong>
        </div>
        <div className={styles.heroChartOrderRow}>
          <span>Review</span>
          <strong>Auto-journal</strong>
        </div>
      </div>
      <div className={styles.heroChartWatermark}>alphavyuh</div>
    </div>
  );
}
