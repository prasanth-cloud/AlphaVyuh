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
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const s = data?.summary;
  const portfolioPnlPos = (s?.total_pnl ?? 0) >= 0;

  return (
    <div className="min-h-screen bg-[#f2f2f0]">
      <div className="max-w-[1100px] mx-auto px-5 py-6">

        {/* Header */}
        <div className="mb-5">
          <div className="text-[20px] font-semibold text-[#1c1c1a]">Portfolio</div>
          <div className="text-[13px] text-[#888] mt-0.5">Open positions &amp; unrealised P&amp;L</div>
        </div>

        {loading && (
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="h-14 rounded-[10px] bg-white border border-[#e2e2df] animate-pulse" />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="bg-white border border-[#e2e2df] rounded-[10px] p-8 text-center text-[13px] text-[#e5383b]">{error}</div>
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
                  <div key={label} className="bg-white border border-[#e2e2df] rounded-[10px] p-4">
                    <div className="text-[10px] uppercase tracking-wider text-[#aaa] font-semibold mb-1">{label}</div>
                    <div className="text-[18px] font-bold tabular-nums" style={{ color }}>{value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Sector breakdown */}
            {data.sectors.length > 0 && (
              <div className="bg-white border border-[#e2e2df] rounded-[10px] p-4 mb-5">
                <div className="text-[11px] uppercase tracking-wider text-[#888] font-semibold mb-3">Sector breakdown</div>
                <div className="space-y-2">
                  {data.sectors.map(sec => {
                    const pos = sec.pnl >= 0;
                    const maxAbs = Math.max(...data.sectors.map(s => Math.abs(s.pnl)));
                    const pct = maxAbs > 0 ? (Math.abs(sec.pnl) / maxAbs) * 100 : 0;
                    return (
                      <div key={sec.sector} className="flex items-center gap-3">
                        <span className="text-[12px] text-[#555] w-[130px] flex-shrink-0 truncate">{sec.sector}</span>
                        <div className="flex-1 h-[6px] bg-[#f0f0ee] rounded-full overflow-hidden">
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
              <div className="bg-white border border-[#e2e2df] rounded-[10px] p-10 text-center">
                <div className="text-[14px] font-semibold text-[#1c1c1a] mb-1">No open positions</div>
                <div className="text-[13px] text-[#888] mb-4">Add trades via the journal or the chart page.</div>
                <button onClick={() => router.push("/journal")}
                  className="px-4 py-2 bg-[#5b63f5] text-white text-[13px] font-semibold rounded-[8px] hover:opacity-90 transition-opacity">
                  Go to Journal →
                </button>
              </div>
            ) : (
              <div className="bg-white border border-[#e2e2df] rounded-[10px] overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#f0f0ee]">
                      {["Symbol", "Type", "Qty", "Entry", "Current", "Day %", "Invested", "P&L"].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-[#aaa] font-semibold">{h}</th>
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
                          className="border-b border-[#f0f0ee] last:border-0 hover:bg-[#fafafa] cursor-pointer transition-colors"
                        >
                          <td className="px-4 py-3">
                            <div className="text-[13px] font-semibold text-[#1c1c1a]">{pos.symbol}</div>
                            {pos.sector && <div className="text-[10px] text-[#aaa] truncate max-w-[100px]">{pos.sector}</div>}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                              style={pos.trade_type === "long"
                                ? { background: "#edfaf3", color: "#26a65b" }
                                : { background: "#fff0f0", color: "#e5383b" }}>
                              {pos.trade_type.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[13px] text-[#1c1c1a] tabular-nums">{pos.quantity}</td>
                          <td className="px-4 py-3 text-[13px] text-[#1c1c1a] tabular-nums">₹{pos.entry_price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3 text-[13px] font-semibold text-[#1c1c1a] tabular-nums">₹{pos.current_price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3 text-[12px] font-semibold tabular-nums" style={{ color: dayPos ? "#26a65b" : "#e5383b" }}>
                            {pos.day_change_pct != null ? `${dayPos ? "+" : ""}${pos.day_change_pct.toFixed(2)}%` : "—"}
                          </td>
                          <td className="px-4 py-3 text-[12px] text-[#888] tabular-nums">{fmtPrice(pos.invested)}</td>
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
