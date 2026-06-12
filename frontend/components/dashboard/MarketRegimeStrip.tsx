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

  return (
    <div className="dashboard-regime-strip" data-testid="dashboard-regime-strip">
      <div className="dashboard-regime-chip">
        <span className="label">Regime</span>
        <Num style={{ fontSize: 13, fontWeight: 600, color: ready ? phaseColor : "var(--warn)" }}>
          {ready ? breadthPhaseLabel(data.market_phase) : "Unavailable"}
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
      <div className="dashboard-regime-ema-row" data-testid="dashboard-regime-ema-row">
        <div className="dashboard-regime-chip dashboard-regime-ema-chip">
          <span className="label">Above EMA20</span>
          <Num style={{ fontSize: 13, fontWeight: 600 }}>
            {ready ? `${safeMarketNumber(data.above_ema20_pct).toFixed(0)}%` : "—"}
          </Num>
        </div>
        <div className="dashboard-regime-chip dashboard-regime-ema-chip">
          <span className="label">Above EMA50</span>
          <Num style={{ fontSize: 13, fontWeight: 600 }}>
            {ready ? `${safeMarketNumber(data.above_ema50_pct).toFixed(0)}%` : "—"}
          </Num>
        </div>
        <div className="dashboard-regime-chip dashboard-regime-ema-chip">
          <span className="label">Above EMA200</span>
          <Num style={{ fontSize: 13, fontWeight: 600 }}>
            {ready ? `${safeMarketNumber(data.above_ema200_pct).toFixed(0)}%` : "—"}
          </Num>
        </div>
      </div>
    </div>
  );
}
