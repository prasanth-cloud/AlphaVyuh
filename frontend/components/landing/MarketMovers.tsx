"use client";

import { useEffect, useState } from "react";
import styles from "./landing.module.css";
import type { MarketMover, MoversResponse } from "@/lib/market/types";

function MoversColumn({
  title,
  rows,
}: {
  title: string;
  rows: MarketMover[];
}) {
  return (
    <div className={styles.moversColumn}>
      <div className={styles.moversHeader}>
        <span>{title}</span>
        <span>Chg%</span>
      </div>
      <div className={styles.moversList}>
        {rows.map((row) => (
          <div key={row.symbol} className={styles.moversRow}>
            <div className={styles.moversRowIdentity}>
              <span className={styles.moversSymbol}>{row.symbol.replace(".NS", "")}</span>
              <span className={styles.moversName}>{row.name}</span>
            </div>
            <div className={styles.moversRowValues}>
              <span className={styles.moversPrice}>
                {row.currency === "INR" ? "₹" : "$"}
                {row.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </span>
              <span className={row.changePercent >= 0 ? styles.tickerGain : styles.tickerLoss}>
                {row.changePercent >= 0 ? "+" : ""}
                {row.changePercent.toFixed(2)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MarketMovers({
  region,
  initialData,
}: {
  region: "IN" | "US";
  initialData: MoversResponse;
}) {
  const [data, setData] = useState(initialData);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const response = await fetch(`/api/market/movers/${region}`, { cache: "no-store" });
        if (!response.ok) return;
        const next = (await response.json()) as MoversResponse;
        if (!cancelled) setData(next);
      } catch {
        // quiet fallback
      }
    };

    const id = window.setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [region]);

  return (
    <div className={styles.moversGrid}>
      <MoversColumn title="Top Gainers" rows={data.gainers} />
      <MoversColumn title="Top Losers" rows={data.losers} />
      <MoversColumn title="Most Active" rows={data.mostActive} />
    </div>
  );
}
