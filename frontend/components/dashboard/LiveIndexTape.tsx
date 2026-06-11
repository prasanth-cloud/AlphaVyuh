"use client";

import { useCallback, useEffect, useState } from "react";
import type { MarketOverview } from "@/lib/api/types";
import { Num } from "@/components/ui";

type TapeQuote = {
  symbol: string;
  label: string;
  price: number;
  changePct: number;
  isIndex: boolean;
};

type TapePayload = {
  quotes: TapeQuote[];
  asOf: string;
  source: string;
};

function fallbackIndices(data: MarketOverview) {
  return (data.indices ?? []).filter(
    (idx) => /nifty|bank/i.test(idx.label) || /nifty|bank/i.test(idx.symbol),
  ).slice(0, 2);
}

export function LiveIndexTape({ data }: { data: MarketOverview }) {
  const [tape, setTape] = useState<TapePayload | null>(null);
  const [tapeError, setTapeError] = useState(false);

  const loadTape = useCallback(async () => {
    try {
      const response = await fetch("/api/public/market-tape", { cache: "no-store" });
      if (!response.ok) {
        setTapeError(true);
        return;
      }
      const payload = (await response.json()) as TapePayload;
      const indices = payload.quotes.filter((quote) => quote.isIndex);
      if (indices.length === 0) {
        setTapeError(true);
        return;
      }
      setTape({ ...payload, quotes: indices });
      setTapeError(false);
    } catch {
      setTapeError(true);
    }
  }, []);

  useEffect(() => {
    loadTape();
    const timer = window.setInterval(loadTape, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [loadTape]);

  const fallback = fallbackIndices(data);

  if (tape && !tapeError) {
    return (
      <div className="dashboard-market-tape" data-testid="dashboard-index-tape">
        {tape.quotes.map((quote) => {
          const tone = quote.changePct >= 0 ? "var(--gain)" : "var(--loss)";
          return (
            <div key={quote.label} className="dashboard-market-tape-item">
              <div className="label" style={{ marginBottom: 4 }}>{quote.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                <Num style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
                  {quote.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                </Num>
                <Num style={{ fontSize: 12, fontWeight: 600, color: tone }}>
                  {quote.changePct >= 0 ? "+" : ""}{quote.changePct.toFixed(2)}%
                </Num>
              </div>
            </div>
          );
        })}
        <div className="caption" style={{ marginTop: 6, color: "var(--text-tertiary)" }}>
          Index quotes refresh from Yahoo Finance · verify levels before trading
        </div>
      </div>
    );
  }

  if (fallback.length === 0) {
    return (
      <div className="dashboard-market-tape" data-testid="dashboard-index-tape">
        <div className="caption" style={{ color: "var(--warn)", lineHeight: 1.5 }}>
          Index tape is temporarily unavailable. Check Data Status before trading off index levels.
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-market-tape" data-testid="dashboard-index-tape">
      {fallback.map((idx) => {
        const pct = idx.pct_change == null ? null : Number(idx.pct_change);
        const close = idx.close == null ? null : Number(idx.close);
        const tone = (pct ?? 0) >= 0 ? "var(--gain)" : "var(--loss)";
        return (
          <div key={idx.symbol} className="dashboard-market-tape-item">
            <div className="label" style={{ marginBottom: 4 }}>{idx.label}</div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <Num style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
                {close != null && Number.isFinite(close)
                  ? close.toLocaleString("en-IN", { maximumFractionDigits: 2 })
                  : "—"}
              </Num>
              <Num style={{ fontSize: 12, fontWeight: 600, color: pct == null ? "var(--text-tertiary)" : tone }}>
                {pct != null && Number.isFinite(pct) ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : "—"}
              </Num>
            </div>
          </div>
        );
      })}
    </div>
  );
}
