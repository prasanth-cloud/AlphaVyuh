"use client";

import {
  CHART_TIMEFRAME_PILL_OPTIONS,
  type ChartTimeframePill,
} from "@/lib/dashboard-equity";
import {
  INTRADAY_UNAVAILABLE_MESSAGE,
  isIntradayTimeframe,
  type WatchlistChartTimeframe,
} from "@/lib/watchlist-chart-range";

type Props = {
  value: WatchlistChartTimeframe;
  onChange: (value: WatchlistChartTimeframe) => void;
  onUnavailable?: (message: string) => void;
  intradayEnabled?: boolean;
};

export default function ChartTimeframePillStrip({
  value,
  onChange,
  onUnavailable,
  intradayEnabled = false,
}: Props) {
  const options = CHART_TIMEFRAME_PILL_OPTIONS.filter(
    (label) => intradayEnabled || !isIntradayTimeframe(label),
  );

  return (
    <div
      className="chart-timeframe-pill-strip"
      data-testid="chart-timeframe-pill-strip"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
        overflowX: "visible",
        padding: "6px 12px",
        borderBottom: "1px solid var(--border-subtle)",
        background: "var(--surface-1)",
        flexShrink: 0,
      }}
    >
      {options.map((label) => (
        <button
          key={label}
          type="button"
          data-testid={`chart-timeframe-pill-${label}`}
          onClick={() => {
            if (!intradayEnabled && isIntradayTimeframe(label)) {
              onUnavailable?.(INTRADAY_UNAVAILABLE_MESSAGE);
              return;
            }
            onChange(label as ChartTimeframePill);
          }}
          className={`workspace-chip-button${value === label ? " active" : ""}`}
          style={{
            flexShrink: 0,
            minWidth: 34,
            justifyContent: "center",
            padding: "4px 10px",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
