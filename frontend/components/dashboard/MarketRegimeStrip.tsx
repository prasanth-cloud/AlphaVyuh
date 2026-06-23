"use client";

import Link from "next/link";
import type { MarketOverview } from "@/lib/api/types";
import { Num } from "@/components/ui";
import {
  breadthPhaseColor,
  breadthPhaseLabel,
  safeMarketNumber,
} from "@/lib/dashboard-market";

const SCANNER_PRESET_52W_HIGH = "high_52w_breakout";
const SCANNER_PRESET_52W_LOW = "low_52w_breakout";

type Props = {
  data: MarketOverview;
  ready: boolean;
};

function FiftyTwoWeekLink({
  label,
  value,
  href,
  tone,
  ready,
}: {
  label: string;
  value: number;
  href: string;
  tone: string;
  ready: boolean;
}) {
  if (!ready) {
    return (
      <div className="dashboard-regime-chip">
        <span className="label">{label}</span>
        <Num style={{ fontSize: 13, fontWeight: 600, color: "var(--warn)" }}>—</Num>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="dashboard-regime-chip dashboard-regime-link"
      title={`Open scanner: ${label}`}
      data-testid={label === "52W highs" ? "dashboard-52w-highs-link" : "dashboard-52w-lows-link"}
    >
      <span className="label">{label}</span>
      <Num style={{ fontSize: 13, fontWeight: 600, color: tone }}>
        {value.toLocaleString()}
      </Num>
    </Link>
  );
}

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
      <FiftyTwoWeekLink
        label="52W highs"
        value={safeMarketNumber(data.new_52w_highs)}
        href={`/scanner?preset=${SCANNER_PRESET_52W_HIGH}`}
        tone="var(--gain)"
        ready={ready}
      />
      <FiftyTwoWeekLink
        label="52W lows"
        value={safeMarketNumber(data.new_52w_lows)}
        href={`/scanner?preset=${SCANNER_PRESET_52W_LOW}`}
        tone="var(--loss)"
        ready={ready}
      />
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
