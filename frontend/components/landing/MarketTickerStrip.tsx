"use client";

import { useEffect, useState } from "react";
import styles from "./landing.module.css";
import type { IndexResponse } from "@/lib/market/types";

function nudgeIndices(source: IndexResponse): IndexResponse {
  return {
    ...source,
    tickers: source.tickers.map((ticker) => {
      const priceMove = ticker.price * (Math.random() * 0.0008 - 0.0004);
      const nextPrice = Number((ticker.price + priceMove).toFixed(2));
      const nextChange = Number((ticker.change + priceMove).toFixed(2));
      const base = nextPrice - nextChange;
      const nextChangePercent = base !== 0 ? Number(((nextChange / base) * 100).toFixed(2)) : ticker.changePercent;
      return {
        ...ticker,
        price: nextPrice,
        change: nextChange,
        changePercent: nextChangePercent,
      };
    }),
  };
}

export default function MarketTickerStrip({
  region,
  initialData,
}: {
  region: "IN" | "US";
  initialData: IndexResponse;
}) {
  const [data, setData] = useState(initialData);

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const response = await fetch(`/api/market/index/${region}`, { cache: "no-store" });
        if (!response.ok) return;
        const next = (await response.json()) as IndexResponse;
        if (!cancelled) setData(next);
      } catch {
        // Landing page should degrade quietly.
      }
    };

    refresh();
    const id = window.setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [region]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setData((current) => nudgeIndices(current));
    }, 2400);

    return () => window.clearInterval(id);
  }, []);

  return (
    <section className={styles.tickerStrip} aria-label="Live market index ticker">
      <div className={styles.tickerTrack}>
        {data.tickers.map((ticker) => (
          <div key={ticker.symbol} className={styles.tickerItem}>
            <span className={styles.tickerName}>{ticker.name}</span>
            <span className={styles.tickerPrice}>
              {ticker.currency === "INR" ? "₹" : "$"}
              {ticker.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            </span>
            <span className={ticker.change >= 0 ? styles.tickerGain : styles.tickerLoss}>
              {ticker.change >= 0 ? "+" : ""}
              {ticker.change.toLocaleString("en-IN", { maximumFractionDigits: 2 })} (
              {ticker.changePercent >= 0 ? "+" : ""}
              {ticker.changePercent.toFixed(2)}%)
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
