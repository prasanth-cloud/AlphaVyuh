"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMarketOverview, getWatchlists, type MarketOverview } from "@/lib/api";

const S = {
  card: {
    background: "var(--app-surface)",
    border: "1px solid var(--app-border)",
    borderRadius: "12px",
  } as React.CSSProperties,
  label: {
    fontSize: "10px",
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.6px",
    color: "var(--app-text3)",
  } as React.CSSProperties,
};

function PhaseBanner({ data }: { data: MarketOverview }) {
  const phase = data.market_phase;
  const cfg = phase === "Bullish"
    ? { bg: "rgba(38,166,91,0.12)", border: "rgba(38,166,91,0.25)", dot: "#26A65B", text: "#4ade80" }
    : phase === "Bearish"
    ? { bg: "rgba(229,56,59,0.12)", border: "rgba(229,56,59,0.25)", dot: "#E5383B", text: "#f87171" }
    : { bg: "rgba(217,119,6,0.12)", border: "rgba(217,119,6,0.25)", dot: "#d97706", text: "#fbbf24" };

  return (
    <div className="mx-5 mt-4 px-4 py-2.5 rounded-[10px] border flex items-center gap-3 flex-wrap"
      style={{ background: cfg.bg, borderColor: cfg.border }}>
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cfg.dot }} />
      <span className="text-[13px] font-semibold" style={{ color: cfg.text }}>{phase} Market</span>
      <span className="text-[12px]" style={{ color: "var(--app-text2)" }}>{data.market_phase_desc}</span>
      <div className="ml-auto text-[11px] hidden sm:flex gap-3 tabular" style={{ color: "var(--app-text3)" }}>
        <span>A/D {data.advance_decline_ratio?.toFixed(2)}</span>
        <span>{data.new_52w_highs} new highs</span>
        <span>{data.above_ema200_pct}% above EMA 200</span>
        <span>EOD {data.trade_date}</span>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="px-4 py-3.5" style={S.card}>
      <div style={S.label} className="mb-1">{label}</div>
      <div className="text-[22px] font-bold tabular" style={{ color }}>{value}</div>
      {sub && <div className="text-[11px] mt-0.5" style={{ color: "var(--app-text3)" }}>{sub}</div>}
    </div>
  );
}

function SectorBreadth({ sectors }: { sectors: MarketOverview["sector_breadth"] }) {
  return (
    <div className="p-4" style={S.card}>
      <div style={S.label} className="mb-3">Sector Breadth</div>
      <div className="space-y-2">
        {sectors.map(s => (
          <div key={s.sector} className="flex items-center gap-3">
            <div className="w-[110px] text-[12px] truncate flex-shrink-0" style={{ color: "var(--app-text2)" }}>{s.sector}</div>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--app-surface3)" }}>
              <div className="h-full rounded-full transition-all"
                style={{
                  width: `${s.breadth_pct}%`,
                  background: s.breadth_pct >= 60 ? "#26A65B" : s.breadth_pct <= 40 ? "#E5383B" : "#d97706"
                }} />
            </div>
            <div className="w-10 text-right text-[12px] tabular font-semibold"
              style={{ color: s.breadth_pct >= 60 ? "#26A65B" : s.breadth_pct <= 40 ? "#E5383B" : "#d97706" }}>
              {s.breadth_pct}%
            </div>
            <div className="w-14 text-right text-[11px] tabular"
              style={{ color: s.avg_pct_change >= 0 ? "#26A65B" : "#E5383B" }}>
              {s.avg_pct_change >= 0 ? "+" : ""}{s.avg_pct_change}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MoverRow({ m, color }: { m: MarketOverview["top_gainers"][0]; color: string }) {
  return (
    <div className="flex items-center gap-2 py-1.5" style={{ borderBottom: "1px solid var(--app-border2)" }}>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold truncate" style={{ color: "var(--app-text1)" }}>{m.symbol}</div>
        <div className="text-[11px] truncate" style={{ color: "var(--app-text3)" }}>{m.company_name}</div>
      </div>
      <div className="text-right">
        <div className="text-[13px] font-semibold tabular" style={{ color: "var(--app-text1)" }}>₹{m.close.toLocaleString("en-IN")}</div>
        <div className="text-[12px] font-bold tabular" style={{ color }}>
          {m.pct_change >= 0 ? "+" : ""}{m.pct_change?.toFixed(2)}%
        </div>
      </div>
      {m.volume_ratio != null && (
        <div className="w-10 text-right text-[11px] tabular" style={{ color: "var(--app-text3)" }}>{m.volume_ratio.toFixed(1)}×</div>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="px-4 py-3.5 rounded-[12px] animate-pulse h-[76px]"
      style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }} />
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<MarketOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(false);

  async function load() {
    try {
      const d = await getMarketOverview();
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    getWatchlists().then(wls => { if (wls.length === 0) setShowOnboarding(true); }).catch(() => {});
    return () => clearInterval(t);
  }, []);

  const greet = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="pb-8">
      {/* Onboarding banner */}
      {showOnboarding && (
        <div className="mx-5 mt-4" style={{
          background: "var(--app-teal-dim)", border: "1px solid rgba(0,229,196,0.2)",
          borderRadius: 10, padding: "14px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div className="text-[14px] font-bold mb-1" style={{ color: "var(--app-teal)" }}>Welcome to AlphaVyuh</div>
            <div className="text-[12px]" style={{ color: "var(--app-text2)" }}>
              Start by scanning for stocks → add to watchlist → chart them → log your first trade
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4 flex-shrink-0">
            <a href="/scanner" style={{ padding: "6px 14px", borderRadius: 6, background: "var(--app-teal)", color: "#050a08", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>
              Start scanning →
            </a>
            <button onClick={() => setShowOnboarding(false)} style={{ background: "none", border: "none", color: "var(--app-text3)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="px-5 pt-4 pb-0">
        <h1 className="text-[18px] font-bold" style={{ color: "var(--app-text1)" }}>{greet()}</h1>
        <p className="text-[13px] mt-0.5" style={{ color: "var(--app-text2)" }}>NSE market overview</p>
      </div>

      {/* Phase banner */}
      {loading ? (
        <div className="mx-5 mt-4 h-10 rounded-[10px] animate-pulse"
          style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }} />
      ) : data ? (
        <PhaseBanner data={data} />
      ) : null}

      {error && (
        <div className="mx-5 mt-4 px-4 py-2 rounded-[10px] text-[13px]"
          style={{ background: "rgba(229,56,59,0.10)", border: "1px solid rgba(229,56,59,0.25)", color: "#f87171" }}>
          {error}
        </div>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 px-5 pt-3">
        {loading ? (
          [1,2,3,4].map(i => <SkeletonCard key={i} />)
        ) : data ? (
          <>
            <MetricCard label="Advances" value={data.advances.toLocaleString()} sub={`of ${data.total} stocks`} color="#26A65B" />
            <MetricCard label="Declines" value={data.declines.toLocaleString()} sub={`A/D ratio ${data.advance_decline_ratio}`} color="#E5383B" />
            <MetricCard label="New 52W Highs" value={data.new_52w_highs} sub="fresh yearly highs" color="var(--app-teal)" />
            <MetricCard label="New 52W Lows" value={data.new_52w_lows} sub="yearly low touches" color="#d97706" />
          </>
        ) : null}
      </div>

      {/* Sector breadth + EMA breadth */}
      {!loading && data && (
        <div className="px-5 pt-3 grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2">
            <SectorBreadth sectors={data.sector_breadth} />
          </div>

          <div className="p-4 flex flex-col gap-3" style={S.card}>
            <div style={S.label}>EMA Breadth</div>
            {[
              { label: "Above EMA 20",  pct: data.above_ema20_pct,  color: "var(--app-teal)" },
              { label: "Above EMA 50",  pct: data.above_ema50_pct,  color: "#818cf8" },
              { label: "Above EMA 200", pct: data.above_ema200_pct, color: "#26A65B" },
            ].map(e => (
              <div key={e.label}>
                <div className="flex justify-between text-[12px] mb-1">
                  <span style={{ color: "var(--app-text2)" }}>{e.label}</span>
                  <span className="font-semibold tabular" style={{ color: e.color }}>{e.pct}%</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--app-surface3)" }}>
                  <div className="h-full rounded-full" style={{ width: `${e.pct}%`, background: e.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Gainers / Losers / Most Active */}
      {!loading && data && (
        <div className="px-5 pt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { title: "Top Gainers",  items: data.top_gainers,  color: "#26A65B" },
            { title: "Top Losers",   items: data.top_losers,   color: "#E5383B" },
            { title: "Most Active",  items: data.most_active,  color: "#818cf8" },
          ].map(({ title, items, color }) => (
            <div key={title} className="p-4" style={S.card}>
              <div style={S.label} className="mb-2">{title}</div>
              {items.map(m => <MoverRow key={m.symbol} m={m} color={color} />)}
            </div>
          ))}
        </div>
      )}

      {/* Quick-nav shortcuts */}
      <div className="px-5 pt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { href: "/scanner",  label: "Scanner",   desc: "Find stocks by filter",  color: "var(--app-teal)" },
          { href: "/watchlist",label: "Watchlist",  desc: "Track your stocks",       color: "#26A65B" },
          { href: "/journal",  label: "Journal",   desc: "Review your trades",      color: "#d97706" },
          { href: "/settings", label: "Settings",  desc: "Broker & account",        color: "#818cf8" },
        ].map(c => (
          <button key={c.href} onClick={() => router.push(c.href)}
            className="px-4 py-3 text-left transition-colors"
            style={{
              ...S.card,
              borderLeft: `2px solid ${c.color}`,
            }}>
            <div className="text-[13px] font-semibold" style={{ color: "var(--app-text1)" }}>{c.label}</div>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--app-text3)" }}>{c.desc}</div>
          </button>
        ))}
      </div>

      {/* Workflow guide */}
      <div className="px-5 pt-4 pb-2">
        <div className="rounded-[12px] px-5 py-4" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div style={S.label} className="mb-3">How to use AlphaVyuh</div>
          <div className="flex flex-col sm:flex-row gap-0 sm:gap-0 relative">
            {[
              { step: "1", title: "Scan", desc: "Pick a preset or set your own filters in the Scanner. Run the scan to get a filtered list of NSE stocks.", href: "/scanner", color: "var(--app-teal)" },
              { step: "2", title: "Watchlist", desc: "Add stocks from the scan results to a watchlist. Monitor them side by side with mini-charts.", href: "/watchlist", color: "#818cf8" },
              { step: "3", title: "Chart", desc: "Open any stock for a full chart. Use drawing tools, apply indicators, and set price alerts.", href: null, color: "#26A65B" },
              { step: "4", title: "Journal", desc: "After a trade, log it in the Journal. AI reviews your P&L and surfaces patterns in your decisions.", href: "/journal", color: "#d97706" },
            ].map((s, i) => (
              <div key={s.step} className="flex sm:flex-col flex-1 gap-3 sm:gap-2 relative">
                {/* connector line */}
                {i < 3 && (
                  <div className="hidden sm:block absolute top-4 left-[calc(50%+16px)] right-0 h-px" style={{ background: "var(--app-border)" }} />
                )}
                <div className="flex sm:flex-col gap-3 sm:gap-2 flex-1 sm:pr-4">
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                      style={{ background: s.color + "22", color: s.color, border: `1px solid ${s.color}44` }}>
                      {s.step}
                    </div>
                    <div className="text-[13px] font-semibold" style={{ color: "var(--app-text1)" }}>{s.title}</div>
                  </div>
                  <div className="text-[11px] leading-relaxed flex-1" style={{ color: "var(--app-text3)" }}>{s.desc}</div>
                  {s.href && (
                    <button onClick={() => router.push(s.href!)}
                      className="self-start text-[11px] font-semibold px-2.5 py-1 rounded-[6px] transition-colors sm:mt-1"
                      style={{ background: s.color + "18", color: s.color, border: `1px solid ${s.color}33` }}>
                      Open →
                    </button>
                  )}
                </div>
                {i < 3 && <div className="sm:hidden w-px self-stretch" style={{ background: "var(--app-border)" }} />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
