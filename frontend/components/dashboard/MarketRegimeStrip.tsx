"use client";

import type { MarketOverview } from "@/lib/api/types";
import { Num } from "@/components/ui";
import {
  breadthPhaseColor,
  breadthPhaseLabel,
  safeMarketNumber,
} from "@/lib/dashboard-market";

type Props = {
  data: MarketOverview;
  ready: boolean;
};

export function MarketRegimeStrip({ data, ready }: Props) {
  const phaseColor = breadthPhaseColor(data.market_phase);
  const adTone = data.advances >= data.declines ? "var(--gain)" : "var(--loss)";

  return (
    <div className="dashboard-regime-strip" data-testid="dashboard-regime-strip">
      <div className="dashboard-regime-chip">
        <span className="label">Regime</span>
        <Num style={{ fontSize: 13, fontWeight: 600, color: ready ? phaseColor : "var(--warn)" }}>
          {ready ? breadthPhaseLabel(data.market_phase) : "Unavailable"}
        </Num>
      </div>
      <div className="dashboard-regime-chip">
        <span className="label">A/D</span>
        <Num style={{ fontSize: 13, fontWeight: 600, color: ready ? adTone : "var(--warn)" }}>
          {ready
            ? `${safeMarketNumber(data.advances).toLocaleString()} / ${safeMarketNumber(data.declines).toLocaleString()}`
            : "—"}
        </Num>
      </div>
      <div className="dashboard-regime-chip">
        <span className="label">Above EMA20</span>
        <Num style={{ fontSize: 13, fontWeight: 600 }}>
          {ready ? `${safeMarketNumber(data.above_ema20_pct).toFixed(0)}%` : "—"}
        </Num>
      </div>
      <div className="dashboard-regime-chip">
        <span className="label">Above EMA50</span>
        <Num style={{ fontSize: 13, fontWeight: 600 }}>
          {ready ? `${safeMarketNumber(data.above_ema50_pct).toFixed(0)}%` : "—"}
        </Num>
      </div>
      <div className="dashboard-regime-chip">
        <span className="label">52W highs</span>
        <Num style={{ fontSize: 13, fontWeight: 600, color: ready ? "var(--gain)" : "var(--warn)" }}>
          {ready ? safeMarketNumber(data.new_52w_highs).toLocaleString() : "—"}
        </Num>
      </div>
      <div className="dashboard-regime-chip">
        <span className="label">52W lows</span>
        <Num style={{ fontSize: 13, fontWeight: 600, color: ready ? "var(--loss)" : "var(--warn)" }}>
          {ready ? safeMarketNumber(data.new_52w_lows).toLocaleString() : "—"}
        </Num>
      </div>
    </div>
  );
}
