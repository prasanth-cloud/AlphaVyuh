"use client";

import { Card, Button } from "@/components/ui";
import {
  buildDashboardEquitySnapshot,
  formatDashboardPnl,
  toneForPnl,
  type DashboardEquitySnapshot,
} from "@/lib/dashboard-equity";
import type { JournalAnalytics, JournalStats } from "@/lib/api/types";

function MiniEquityCurve({ data }: { data: { date: string; cumulative_pnl: number }[] }) {
  if (data.length < 2) {
    return (
      <div
        style={{
          height: 88,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          color: "var(--text-tertiary)",
          borderRadius: "var(--radius-md)",
          border: "1px dashed var(--border-subtle)",
          background: "var(--surface-2)",
        }}
      >
        Close one more trade to draw the equity curve
      </div>
    );
  }

  const W = 320;
  const H = 88;
  const PAD = 6;
  const vals = data.map((point) => point.cumulative_pnl);
  const min = Math.min(0, ...vals);
  const max = Math.max(0, ...vals);
  const range = max - min || 1;
  const pts = data.map((point, index) => {
    const x = PAD + (index / (data.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((point.cumulative_pnl - min) / range) * (H - PAD * 2);
    return `${x},${y}`;
  });
  const zeroY = H - PAD - ((0 - min) / range) * (H - PAD * 2);
  const last = vals[vals.length - 1];
  const color = last >= 0 ? "var(--gain)" : "var(--loss)";
  const fillPts = `${PAD},${zeroY} ${pts.join(" ")} ${W - PAD},${zeroY}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 88 }} preserveAspectRatio="none" aria-hidden>
      <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke="var(--border-subtle)" strokeWidth="1" />
      <polygon points={fillPts} fill={last >= 0 ? "rgba(45,181,116,0.12)" : "rgba(229,56,59,0.12)"} />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function MonthlyPnlStrip({ rows }: { rows: { month: string; pnl: number }[] }) {
  if (rows.length === 0) return null;
  const recent = rows.slice(-6);
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {recent.map((row) => {
        const positive = row.pnl >= 0;
        return (
          <div
            key={row.month}
            style={{
              flex: "1 1 52px",
              minWidth: 52,
              padding: "8px 6px",
              borderRadius: "var(--radius-md)",
              textAlign: "center",
              background: positive ? "var(--gain-subtle)" : "var(--loss-subtle)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div className="mono" style={{ fontSize: 11, fontWeight: 600, color: positive ? "var(--gain)" : "var(--loss)" }}>
              {formatDashboardPnl(row.pnl)}
            </div>
            <div className="caption" style={{ marginTop: 2 }}>{row.month}</div>
          </div>
        );
      })}
    </div>
  );
}

type Props = {
  stats: JournalStats | null;
  analytics: JournalAnalytics | null;
  closedTrades: number;
  openTrades?: number;
  unavailable?: boolean;
  unavailableMessage?: string;
};

export function DashboardEquitySnapshotCard({
  stats,
  analytics,
  closedTrades,
  openTrades,
  unavailable,
  unavailableMessage,
}: Props) {
  const snapshot: DashboardEquitySnapshot = buildDashboardEquitySnapshot({
    unavailable,
    unavailableMessage,
    stats,
    analytics,
    closedTrades,
    openTrades,
  });

  return (
    <Card padding="md" style={{ marginBottom: 16 }} data-testid="dashboard-equity-snapshot">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div>
          <h2 className="heading-card" style={{ fontWeight: 600, marginBottom: 4 }}>P&amp;L snapshot</h2>
          <div className="caption">Closed-trade equity from your journal — not broker cash balance.</div>
        </div>
        <a href="/journal?tab=analytics" className="caption" style={{ color: "var(--accent)", textDecoration: "none" }}>
          Open journal analytics
        </a>
      </div>

      {snapshot.status === "unavailable" && (
        <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.22)" }}>
          <div className="label" style={{ color: "var(--warn)", marginBottom: 6 }}>Journal P&amp;L unavailable</div>
          <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-secondary)" }}>{snapshot.message}</div>
          <div style={{ marginTop: 10 }}>
            <Button variant="secondary" size="sm" onClick={() => { window.location.href = "/data"; }}>
              Open Data Status
            </Button>
          </div>
        </div>
      )}

      {snapshot.status === "empty" && (
        <div
          data-testid="dashboard-equity-empty"
          style={{ padding: "18px 14px", borderRadius: "var(--radius-md)", background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
            No closed trades yet
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-secondary)", marginBottom: 12 }}>
            {snapshot.openTrades > 0
              ? `${snapshot.openTrades} open ${snapshot.openTrades === 1 ? "plan" : "plans"} waiting for exit. Close a trade or import history before P&L appears here.`
              : "Log or import your first trade, then close it to unlock the equity curve and monthly P&L calendar."}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="primary" size="sm" onClick={() => { window.location.href = "/journal"; }}>
              Open journal
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { window.location.href = "/scanner"; }}>
              Run scanner
            </Button>
          </div>
        </div>
      )}

      {snapshot.status === "ready" && (
        <div className="dashboard-equity-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", gap: 14, alignItems: "stretch" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
              {[
                { label: "Closed-trade P&L", value: formatDashboardPnl(snapshot.totalPnl), tone: toneForPnl(snapshot.totalPnl) },
                { label: "Win rate", value: snapshot.winRate != null ? `${snapshot.winRate.toFixed(1)}%` : "—", tone: "var(--text-primary)" },
                { label: "Closed", value: String(snapshot.closedTrades), tone: "var(--text-primary)" },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{ flex: "1 1 88px", minWidth: 88, padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}
                >
                  <div className="label" style={{ marginBottom: 4 }}>{item.label}</div>
                  <div className="mono" style={{ fontSize: 15, fontWeight: 600, color: item.tone }}>{item.value}</div>
                </div>
              ))}
            </div>
            <MiniEquityCurve data={snapshot.equityCurve} />
          </div>
          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="label">Monthly P&amp;L</div>
            {snapshot.monthlyPnl.length > 0 ? (
              <MonthlyPnlStrip rows={snapshot.monthlyPnl} />
            ) : (
              <div className="caption" style={{ padding: "12px 0" }}>
                Monthly buckets appear after more closed trades are tagged in journal analytics.
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
