"use client";

import { Card } from "@/components/ui";
import type { JournalAnalytics as JournalAnalyticsType } from "./types";

// ── SVG charts ────────────────────────────────────────────────────────────────

function EquityCurve({ data }: { data: { date: string; cumulative_pnl: number }[] }) {
  if (data.length < 2) return (
    <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--text-tertiary)" }}>
      Close at least 2 trades to see equity curve
    </div>
  );
  const W = 600, H = 140, PAD = 8;
  const vals = data.map(d => d.cumulative_pnl);
  const min = Math.min(0, ...vals);
  const max = Math.max(0, ...vals);
  const range = max - min || 1;
  const pts = data.map((d, i) => {
    const x = PAD + (i / (data.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((d.cumulative_pnl - min) / range) * (H - PAD * 2);
    return `${x},${y}`;
  });
  const zeroY = H - PAD - ((0 - min) / range) * (H - PAD * 2);
  const last = vals[vals.length - 1];
  const color = last >= 0 ? "var(--gain)" : "var(--loss)";
  const fillPts = `${PAD},${zeroY} ${pts.join(" ")} ${W - PAD},${zeroY}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 160 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="eq-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: last >= 0 ? 'var(--gain)' : 'var(--loss)', stopOpacity: 0.18 }} />
          <stop offset="100%" style={{ stopColor: last >= 0 ? 'var(--gain)' : 'var(--loss)', stopOpacity: 0.02 }} />
        </linearGradient>
      </defs>
      <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke="var(--border-subtle)" strokeWidth="1" />
      <polygon points={fillPts} fill="url(#eq-grad)" />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function DrawdownChart({ data }: { data: { date: string; drawdown: number; drawdown_pct: number }[] }) {
  if (data.length < 2) return null;
  const hasDD = data.some(d => d.drawdown < 0);
  if (!hasDD) return (
    <div style={{ height: 100, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--gain)" }}>
      No drawdown — all-time high throughout
    </div>
  );
  const W = 600, H = 100, PAD = 8;
  const vals = data.map(d => d.drawdown);
  const min = Math.min(...vals, -0.01);
  const pts = data.map((d, i) => {
    const x = PAD + (i / (data.length - 1)) * (W - PAD * 2);
    const y = PAD + ((0 - d.drawdown) / (0 - min)) * (H - PAD * 2);
    return `${x},${y}`;
  });
  const fillPts = `${PAD},${H - PAD} ${pts.join(" ")} ${W - PAD},${H - PAD}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 100 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="dd-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--loss)', stopOpacity: 0.25 }} />
          <stop offset="100%" style={{ stopColor: 'var(--loss)', stopOpacity: 0.04 }} />
        </linearGradient>
      </defs>
      <polygon points={fillPts} fill="url(#dd-grad)" />
      <polyline points={pts.join(" ")} fill="none" stroke="var(--loss)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface JournalAnalyticsProps {
  analytics: JournalAnalyticsType | null;
}

export function JournalAnalytics({ analytics }: JournalAnalyticsProps) {
  return (
    <div>
      <Card padding="lg">
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Equity curve */}
          <div>
            <h2 className="heading-card" style={{ marginBottom: 4 }}>Equity curve</h2>
            <div className="caption" style={{ marginBottom: 12 }}>Cumulative P&amp;L across closed trades</div>
            <EquityCurve data={analytics?.equity_curve ?? []} />
          </div>

          {/* Monthly P&L */}
          {(analytics?.monthly_pnl?.length ?? 0) > 0 && (
            <div>
              <h2 className="heading-card" style={{ marginBottom: 12 }}>Monthly P&amp;L</h2>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {analytics!.monthly_pnl.map(m => {
                  const pos = m.pnl >= 0;
                  return (
                    <div key={m.month} style={{ flex: "1 1 80px", minWidth: 80, borderRadius: "var(--radius-md)", padding: "10px 12px", textAlign: "center", background: pos ? "var(--gain-subtle)" : "var(--loss-subtle)" }}>
                      <div className="mono" style={{ fontSize: 11, fontWeight: 600, color: pos ? "var(--gain)" : "var(--loss)" }}>
                        {m.pnl >= 0 ? "+" : ""}₹{Math.abs(m.pnl).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </div>
                      <div className="caption" style={{ marginTop: 2 }}>{m.month}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Setup breakdown */}
          {(analytics?.setup_breakdown?.length ?? 0) > 0 && (
            <div>
              <h2 className="heading-card" style={{ marginBottom: 12 }}>Performance by setup</h2>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      {["Setup", "Trades", "Win rate", "Avg P&L", "Total P&L"].map(h => (
                        <th key={h} className="label" style={{ textAlign: "left", paddingBottom: 8, paddingRight: 16 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {analytics!.setup_breakdown.map(s => {
                      const pos = s.total_pnl >= 0;
                      return (
                        <tr key={s.setup} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                          <td style={{ padding: "10px 16px 10px 0", color: "var(--text-primary)", fontWeight: 500 }}>{s.setup}</td>
                          <td style={{ padding: "10px 16px 10px 0", color: "var(--text-secondary)" }}>{s.trades}</td>
                          <td style={{ padding: "10px 16px 10px 0" }}>
                            <span className="mono" style={{ fontWeight: 600, color: s.win_rate >= 50 ? "var(--gain)" : "var(--loss)" }}>{s.win_rate}%</span>
                          </td>
                          <td style={{ padding: "10px 16px 10px 0" }}>
                            <span className="mono" style={{ color: s.avg_pnl >= 0 ? "var(--gain)" : "var(--loss)" }}>
                              {s.avg_pnl >= 0 ? "+" : ""}₹{Math.abs(s.avg_pnl).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                            </span>
                          </td>
                          <td style={{ padding: "10px 0" }}>
                            <span className="mono" style={{ fontWeight: 600, color: pos ? "var(--gain)" : "var(--loss)" }}>
                              {pos ? "+" : ""}₹{Math.abs(s.total_pnl).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Drawdown */}
          {(analytics?.drawdown_curve?.length ?? 0) > 1 && (
            <div>
              <h2 className="heading-card" style={{ marginBottom: 4 }}>Drawdown</h2>
              <div className="caption" style={{ marginBottom: 10 }}>Underwater equity relative to all-time high</div>
              <DrawdownChart data={analytics!.drawdown_curve} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 12 }}>
                {[
                  { label: "Max drawdown", val: analytics!.max_drawdown != null ? `₹${analytics!.max_drawdown.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "—", neg: true },
                  { label: "Longest DD", val: analytics!.longest_dd_days ? `${analytics!.longest_dd_days}d` : "—", neg: true },
                  { label: "Recovery factor", val: analytics!.recovery_factor != null ? analytics!.recovery_factor.toFixed(2) : "—", neg: analytics!.recovery_factor != null && analytics!.recovery_factor < 1 },
                  { label: "Profit factor", val: analytics!.profit_factor != null ? analytics!.profit_factor.toFixed(2) : "—", neg: analytics!.profit_factor != null && analytics!.profit_factor < 1 },
                ].map(item => (
                  <div key={item.label} style={{ borderRadius: "var(--radius-md)", padding: "10px 12px", textAlign: "center", background: "var(--surface-2)" }}>
                    <div className="mono" style={{ fontSize: 15, fontWeight: 600, color: item.neg ? "var(--loss)" : "var(--gain)" }}>{item.val}</div>
                    <div className="caption" style={{ marginTop: 4 }}>{item.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!analytics?.setup_breakdown?.length && !analytics?.equity_curve?.length && (
            <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-tertiary)", fontSize: 13 }}>
              Close some trades to see analytics here.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
