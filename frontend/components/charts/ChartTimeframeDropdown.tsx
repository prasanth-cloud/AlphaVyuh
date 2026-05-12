"use client";

import { Clock3 } from "lucide-react";
import {
  CHART_TIMEFRAME_OPTIONS,
  INTRADAY_UNAVAILABLE_MESSAGE,
  isIntradayTimeframe,
  type WatchlistChartTimeframe,
} from "@/lib/watchlist-chart-range";

type Props = {
  value: WatchlistChartTimeframe;
  onChange: (value: WatchlistChartTimeframe) => void;
  onUnavailable?: (message: string) => void;
  align?: "left" | "right";
};

export default function ChartTimeframeDropdown({ value, onChange, onUnavailable, align = "right" }: Props) {
  return (
    <details className="chart-timeframe-dropdown" style={{ position: "relative" }}>
      <summary
        className="workspace-chip-button"
        style={{ listStyle: "none", display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}
      >
        <Clock3 size={13} />
        {value}
      </summary>
      <div
        style={{
          position: "absolute",
          [align]: 0,
          top: "calc(100% + 6px)",
          zIndex: 50,
          width: 236,
          padding: 8,
          borderRadius: 10,
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-panel)",
        }}
      >
        <div className="label" style={{ marginBottom: 6 }}>Intraday</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 }}>
          {CHART_TIMEFRAME_OPTIONS.filter((option) => option.group === "Intraday").map((option) => (
            <button
              key={option.label}
              type="button"
              aria-disabled={option.disabled ? "true" : undefined}
              title={option.unavailableReason ?? INTRADAY_UNAVAILABLE_MESSAGE}
              onClick={() => {
                if (isIntradayTimeframe(option.label)) {
                  onUnavailable?.(option.unavailableReason ?? INTRADAY_UNAVAILABLE_MESSAGE);
                  return;
                }
                onChange(option.label);
              }}
              className="workspace-chip-button"
              style={{
                justifyContent: "center",
                opacity: 0.45,
                cursor: "not-allowed",
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="caption" style={{ margin: "7px 0 8px", lineHeight: 1.4 }}>
          {INTRADAY_UNAVAILABLE_MESSAGE}
        </div>

        <div className="label" style={{ marginBottom: 6 }}>Historical ranges</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 6 }}>
          {CHART_TIMEFRAME_OPTIONS.filter((option) => option.group === "Historical").map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => onChange(option.label)}
              className={`workspace-chip-button${value === option.label ? " active" : ""}`}
              style={{ justifyContent: "center" }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </details>
  );
}
