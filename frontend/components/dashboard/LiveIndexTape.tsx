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

const INDEX_ORDER = ["NIFTY 50", "BANKNIFTY", "SENSEX"];

function sortIndexQuotes(quotes: TapeQuote[]) {
  const rank = (label: string) => {
    const normalized = label.toUpperCase();
    const idx = INDEX_ORDER.findIndex((name) => normalized.includes(name.replace(" ", "")) || normalized.includes(name));
    return idx === -1 ? INDEX_ORDER.length : idx;
  };
  return [...quotes].sort((a, b) => rank(a.label) - rank(b.label));
}

function fallbackIndices(data: MarketOverview) {
  const indices = (data.indices ?? []).filter(
    (idx) => /nifty|bank|sensex/i.test(idx.label) || /nifty|bank|sensex/i.test(idx.symbol),
  );
  const nifty = indices.find((idx) => /nifty 50|^nifty$/i.test(idx.label) || /nifty/i.test(idx.symbol) && !/bank/i.test(idx.label));
  const bank = indices.find((idx) => /bank/i.test(idx.label) || /bank/i.test(idx.symbol));
  const sensex = indices.find((idx) => /sensex/i.test(idx.label) || /sensex/i.test(idx.symbol));
  return [nifty, bank, sensex].filter((idx): idx is NonNullable<typeof nifty> => idx != null);
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
      setTape({ ...payload, quotes: sortIndexQuotes(indices) });
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
