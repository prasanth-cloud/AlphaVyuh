"use client";

import { Num } from "@/components/ui";

type ScannerChartRow = {
  symbol: string;
  company_name: string;
  close: number;
  pct_change: number | null;
  week_52_high_pct: number | null;
};

type Props = {
  results: ScannerChartRow[];
  selected: Set<string>;
  onToggleSelect: (symbol: string, checked: boolean) => void;
  onOpenChart: (result: ScannerChartRow) => void;
};

export function ScannerChartsPanel({ results, selected, onToggleSelect, onOpenChart }: Props) {
  return (
    <div data-testid="scanner-charts-panel" style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
      <div style={{ display: "grid", gap: 12 }}>
        {results.map((row) => {
          const pct = row.pct_change ?? 0;
          const tone = pct >= 0 ? "var(--gain)" : "var(--loss)";
          const rangePct = row.week_52_high_pct ?? 50;
          const barWidth = Math.max(8, Math.min(100, 100 - Math.min(rangePct, 100)));
          return (
            <div
              key={row.symbol}
              style={{
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                padding: 12,
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <input
                  type="checkbox"
                  checked={selected.has(row.symbol)}
                  onChange={(e) => onToggleSelect(row.symbol, e.target.checked)}
                  aria-label={`Select ${row.symbol}`}
                  style={{ accentColor: "var(--accent)" }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <span className="mono" style={{ fontSize: 14, fontWeight: 700 }}>{row.symbol}</span>
                    <span className="caption">{row.company_name}</span>
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 12 }}>
                    <Num style={{ fontWeight: 600 }}>₹{row.close.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</Num>
                    <Num style={{ color: tone, fontWeight: 600 }}>
                      {row.pct_change == null ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`}
                    </Num>
                  </div>
                </div>
                <button type="button" className="workspace-chip-button" onClick={() => onOpenChart(row)}>
                  Open chart
                </button>
              </div>
              <div
                aria-hidden="true"
                style={{
                  height: 56,
                  borderRadius: 8,
                  background: "linear-gradient(90deg, var(--loss-subtle) 0%, var(--surface-2) 50%, var(--gain-subtle) 100%)",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 8,
                    bottom: 8,
                    left: `${barWidth}%`,
                    width: 3,
                    borderRadius: 2,
                    background: "var(--accent)",
                    transform: "translateX(-50%)",
                  }}
                />
              </div>
              <div className="caption" style={{ marginTop: 6, color: "var(--text-tertiary)" }}>
                52W range position · {row.week_52_high_pct == null ? "—" : `${row.week_52_high_pct.toFixed(1)}% below high`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
