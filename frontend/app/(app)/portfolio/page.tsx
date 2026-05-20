"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getPortfolio } from "@/lib/api";
import type { PortfolioResponse } from "@/lib/api";

function fmtPrice(v: number) {
  if (Math.abs(v) >= 10_000_000) return `₹${(v / 10_000_000).toFixed(2)}Cr`;
  if (Math.abs(v) >= 100_000)    return `₹${(v / 100_000).toFixed(2)}L`;
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function PnlBadge({ value, pct }: { value: number; pct: number }) {
  const pos = value >= 0;
  return (
    <div className="text-right">
      <div className="text-[12px] font-semibold tabular-nums" style={{ color: pos ? "#26a65b" : "#e5383b" }}>
        {pos ? "+" : ""}{fmtPrice(value)}
      </div>
      <div className="text-[10px] tabular-nums" style={{ color: pos ? "#26a65b" : "#e5383b" }}>
        {pos ? "+" : ""}{pct.toFixed(2)}%
      </div>
    </div>
  );
}

export default function PortfolioPage() {
  const router = useRouter();
  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getPortfolio()
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : "Portfolio is temporarily unavailable."))
      .finally(() => setLoading(false));
  }, []);

  const s = data?.summary;
  const portfolioPnlPos = (s?.total_pnl ?? 0) >= 0;

  return (
    <div className="min-h-screen" style={{ background: "transparent" }}>
      <div className="max-w-[1100px] mx-auto py-0">

        {/* Header */}
        <div style={{
          padding: "22px 24px",
          borderRadius: 24,
          border: "1px solid rgba(255,255,255,0.08)",
          background:
            "radial-gradient(circle at top right, rgba(90,139,232,0.14), transparent 28%), linear-gradient(180deg, rgba(13,22,26,0.94), rgba(10,14,18,0.96))",
          boxShadow: "var(--shadow-panel)",
          marginBottom: 16,
        }}>
          <div className="label" style={{ color: "var(--accent)", marginBottom: 10 }}>Portfolio</div>
          <div style={{ fontSize: "clamp(28px, 4vw, 42px)", lineHeight: 1.02, letterSpacing: "-0.04em", marginBottom: 8, color: "var(--text-primary)" }}>Open positions and unrealised P&amp;L in one operating view.</div>
          <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7 }}>Review current exposure, check sector concentration, and jump straight into the chart of any active position.</div>
        </div>

        {loading && (
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="h-14 rounded-[16px] animate-pulse" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }} />
            ))}
          </div>
        )}

        {!loading && error && (
          <div
            data-testid="portfolio-unavailable"
            className="rounded-[20px] p-8 text-center text-[13px]"
            style={{ background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.24)", color: "var(--warn)", boxShadow: "var(--shadow-panel)" }}
          >
            <div className="text-[14px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Portfolio unavailable</div>
            <div>{error}</div>
            <div className="mt-2" style={{ color: "var(--text-secondary)" }}>
              Open positions are not being treated as empty while account data is unavailable.
            </div>
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* Summary strip */}
            {s && s.open_count > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                {[
                  { label: "Invested", value: fmtPrice(s.total_invested), color: "#1c1c1a" },
                  { label: "Current value", value: fmtPrice(s.total_current), color: "#1c1c1a" },
                  { label: "Unrealised P&L", value: `${portfolioPnlPos ? "+" : ""}${fmtPrice(s.total_pnl)}`, color: portfolioPnlPos ? "#26a65b" : "#e5383b" },
                  { label: "Return", value: `${portfolioPnlPos ? "+" : ""}${s.total_pnl_pct.toFixed(2)}%`, color: portfolioPnlPos ? "#26a65b" : "#e5383b" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="rounded-[18px] p-4" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015)), var(--surface-1)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "var(--shadow-panel)" }}>
                    <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--text-tertiary)" }}>{label}</div>
                    <div className="text-[18px] font-bold tabular-nums" style={{ color }}>{value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Sector breakdown */}
            {data.sectors.length > 0 && (
              <div className="rounded-[20px] p-4 mb-5" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015)), var(--surface-1)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "var(--shadow-panel)" }}>
                <div className="text-[11px] uppercase tracking-wider font-semibold mb-3" style={{ color: "var(--text-tertiary)" }}>Sector breakdown</div>
                <div className="space-y-2">
                  {data.sectors.map(sec => {
                    const pos = sec.pnl >= 0;
                    const maxAbs = Math.max(...data.sectors.map(s => Math.abs(s.pnl)));
                    const pct = maxAbs > 0 ? (Math.abs(sec.pnl) / maxAbs) * 100 : 0;
                    return (
                      <div key={sec.sector} className="flex items-center gap-3">
                        <span className="text-[12px] w-[130px] flex-shrink-0 truncate" style={{ color: "var(--text-secondary)" }}>{sec.sector}</span>
                        <div className="flex-1 h-[6px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, background: pos ? "#26a65b" : "#e5383b" }} />
                        </div>
                        <span className="text-[12px] font-semibold tabular-nums w-[80px] text-right" style={{ color: pos ? "#26a65b" : "#e5383b" }}>
                          {pos ? "+" : ""}{fmtPrice(sec.pnl)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Positions table */}
            {data.positions.length === 0 ? (
              <div className="rounded-[20px] p-10 text-center" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015)), var(--surface-1)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "var(--shadow-panel)" }}>
                <div className="text-[14px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>No open positions</div>
                <div className="text-[13px] mb-4" style={{ color: "var(--text-secondary)" }}>Add trades via the journal or the chart page.</div>
                <button onClick={() => router.push("/journal")}
                  className="px-4 py-2 text-[13px] font-semibold rounded-[999px] hover:opacity-90 transition-opacity"
                  style={{ background: "linear-gradient(180deg, var(--accent-strong), var(--accent))", color: "var(--text-on-accent)" }}>
                  Go to Journal →
                </button>
              </div>
            ) : (
              <div className="rounded-[20px] overflow-hidden" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015)), var(--surface-1)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "var(--shadow-panel)" }}>
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      {["Symbol", "Type", "Qty", "Entry", "Current", "Day %", "Invested", "P&L"].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-tertiary)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.positions.map(pos => {
                      const dayPos = (pos.day_change_pct ?? 0) >= 0;
                      return (
                        <tr
                          key={pos.id}
                          onClick={() => router.push(`/charts/${pos.symbol}`)}
                          className="last:border-0 cursor-pointer transition-colors"
                          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                        >
                          <td className="px-4 py-3">
                            <div className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{pos.symbol}</div>
                            {pos.sector && <div className="text-[10px] truncate max-w-[100px]" style={{ color: "var(--text-tertiary)" }}>{pos.sector}</div>}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                              style={pos.trade_type === "long"
                                ? { background: "var(--gain-subtle)", color: "var(--gain)" }
                                : { background: "var(--loss-subtle)", color: "var(--loss)" }}>
                              {pos.trade_type.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[13px] tabular-nums" style={{ color: "var(--text-primary)" }}>{pos.quantity}</td>
                          <td className="px-4 py-3 text-[13px] tabular-nums" style={{ color: "var(--text-primary)" }}>₹{pos.entry_price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3 text-[13px] font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>₹{pos.current_price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3 text-[12px] font-semibold tabular-nums" style={{ color: dayPos ? "#26a65b" : "#e5383b" }}>
                            {pos.day_change_pct != null ? `${dayPos ? "+" : ""}${pos.day_change_pct.toFixed(2)}%` : "—"}
                          </td>
                          <td className="px-4 py-3 text-[12px] tabular-nums" style={{ color: "var(--text-secondary)" }}>{fmtPrice(pos.invested)}</td>
                          <td className="px-4 py-3">
                            <PnlBadge value={pos.unrealised_pnl} pct={pos.unrealised_pnl_pct} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
