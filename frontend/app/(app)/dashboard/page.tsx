"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMarketOverview, type MarketOverview } from "@/lib/api";

function PhaseBanner({ data }: { data: MarketOverview }) {
  const phase = data.market_phase;
  const cfg = phase === "Bullish"
    ? { bg: "#edfaf3", border: "#26a65b40", dot: "#26a65b", text: "#166534" }
    : phase === "Bearish"
    ? { bg: "#fff0f0", border: "#e5383b40", dot: "#e5383b", text: "#991b1b" }
    : { bg: "#fff8ec", border: "#d9770640", dot: "#d97706", text: "#92400e" };

  return (
    <div className="mx-5 mt-4 px-4 py-2.5 rounded-[10px] border flex items-center gap-3 flex-wrap"
      style={{ background: cfg.bg, borderColor: cfg.border }}>
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cfg.dot }} />
      <span className="text-[13px] font-semibold" style={{ color: cfg.text }}>{phase} Market</span>
      <span className="text-[12px] text-[#888]">{data.market_phase_desc}</span>
      <div className="ml-auto text-[11px] text-[#aaa] hidden sm:flex gap-3 tabular">
        <span>A/D {data.advance_decline_ratio?.toFixed(2)}</span>
        <span>{data.new_52w_highs} new highs</span>
        <span>{data.above_ema200_pct}% above EMA 200</span>
        <span className="text-[#bbb]">EOD {data.trade_date}</span>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="bg-white border border-[#e8e8e6] rounded-[10px] px-4 py-3.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[#aaa] mb-1">{label}</div>
      <div className="text-[22px] font-bold tabular" style={{ color }}>{value}</div>
      {sub && <div className="text-[11px] text-[#bbb] mt-0.5">{sub}</div>}
    </div>
  );
}

function SectorBreadth({ sectors }: { sectors: MarketOverview["sector_breadth"] }) {
  return (
    <div className="bg-white border border-[#e8e8e6] rounded-[10px] p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[#aaa] mb-3">Sector Breadth</div>
      <div className="space-y-2">
        {sectors.map(s => (
          <div key={s.sector} className="flex items-center gap-3">
            <div className="w-[110px] text-[12px] text-[#555] truncate flex-shrink-0">{s.sector}</div>
            <div className="flex-1 h-2 bg-[#f2f2f0] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all"
                style={{
                  width: `${s.breadth_pct}%`,
                  background: s.breadth_pct >= 60 ? "#26a65b" : s.breadth_pct <= 40 ? "#e5383b" : "#d97706"
                }} />
            </div>
            <div className="w-10 text-right text-[12px] tabular font-semibold"
              style={{ color: s.breadth_pct >= 60 ? "#26a65b" : s.breadth_pct <= 40 ? "#e5383b" : "#d97706" }}>
              {s.breadth_pct}%
            </div>
            <div className="w-14 text-right text-[11px] tabular"
              style={{ color: s.avg_pct_change >= 0 ? "#26a65b" : "#e5383b" }}>
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
    <div className="flex items-center gap-2 py-1.5 border-b border-[#f2f2f0] last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-[#1c1c1a] truncate">{m.symbol}</div>
        <div className="text-[11px] text-[#aaa] truncate">{m.company_name}</div>
      </div>
      <div className="text-right">
        <div className="text-[13px] font-semibold tabular text-[#1c1c1a]">₹{m.close.toLocaleString("en-IN")}</div>
        <div className="text-[12px] font-bold tabular" style={{ color }}>
          {m.pct_change >= 0 ? "+" : ""}{m.pct_change?.toFixed(2)}%
        </div>
      </div>
      {m.volume_ratio != null && (
        <div className="w-10 text-right text-[11px] text-[#888] tabular">{m.volume_ratio.toFixed(1)}×</div>
      )}
    </div>
  );
}

function SkeletonCard() {
  return <div className="bg-white border border-[#e8e8e6] rounded-[10px] px-4 py-3.5 animate-pulse h-[76px]" />;
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<MarketOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      {/* Header */}
      <div className="px-5 pt-5 pb-0">
        <h1 className="text-[18px] font-bold text-[#1c1c1a]">{greet()}</h1>
        <p className="text-[13px] text-[#888] mt-0.5">NSE market overview</p>
      </div>

      {/* Phase banner */}
      {loading ? (
        <div className="mx-5 mt-4 h-10 rounded-[10px] bg-white border border-[#e8e8e6] animate-pulse" />
      ) : data ? (
        <PhaseBanner data={data} />
      ) : null}

      {error && (
        <div className="mx-5 mt-4 px-4 py-2 rounded-[10px] bg-[#fff0f0] border border-[#e5383b40] text-[13px] text-[#e5383b]">
          {error}
        </div>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 px-5 pt-3">
        {loading ? (
          [1,2,3,4].map(i => <SkeletonCard key={i} />)
        ) : data ? (
          <>
            <MetricCard label="Advances" value={data.advances.toLocaleString()} sub={`of ${data.total} stocks`} color="#26a65b" />
            <MetricCard label="Declines" value={data.declines.toLocaleString()} sub={`A/D ratio ${data.advance_decline_ratio}`} color="#e5383b" />
            <MetricCard label="New 52W Highs" value={data.new_52w_highs} sub="fresh yearly highs" color="#5b63f5" />
            <MetricCard label="New 52W Lows" value={data.new_52w_lows} sub="yearly low touches" color="#d97706" />
          </>
        ) : null}
      </div>

      {/* Sector breadth + movers */}
      {!loading && data && (
        <div className="px-5 pt-3 grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Sector breadth — takes 2 cols */}
          <div className="lg:col-span-2">
            <SectorBreadth sectors={data.sector_breadth} />
          </div>

          {/* EMA breadth strip */}
          <div className="bg-white border border-[#e8e8e6] rounded-[10px] p-4 flex flex-col gap-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[#aaa]">EMA Breadth</div>
            {[
              { label: "Above EMA 20", pct: data.above_ema20_pct, color: "#5b63f5" },
              { label: "Above EMA 50", pct: data.above_ema50_pct, color: "#7c6af0" },
              { label: "Above EMA 200", pct: data.above_ema200_pct, color: "#26a65b" },
            ].map(e => (
              <div key={e.label}>
                <div className="flex justify-between text-[12px] mb-1">
                  <span className="text-[#555]">{e.label}</span>
                  <span className="font-semibold tabular" style={{ color: e.color }}>{e.pct}%</span>
                </div>
                <div className="h-1.5 bg-[#f2f2f0] rounded-full overflow-hidden">
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
          <div className="bg-white border border-[#e8e8e6] rounded-[10px] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[#aaa] mb-2">Top Gainers</div>
            {data.top_gainers.map(m => <MoverRow key={m.symbol} m={m} color="#26a65b" />)}
          </div>
          <div className="bg-white border border-[#e8e8e6] rounded-[10px] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[#aaa] mb-2">Top Losers</div>
            {data.top_losers.map(m => <MoverRow key={m.symbol} m={m} color="#e5383b" />)}
          </div>
          <div className="bg-white border border-[#e8e8e6] rounded-[10px] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[#aaa] mb-2">Most Active</div>
            {data.most_active.map(m => <MoverRow key={m.symbol} m={m} color="#7c6af0" />)}
          </div>
        </div>
      )}

      {/* Quick-nav shortcuts */}
      <div className="px-5 pt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { href: "/scanner", label: "Scanner", desc: "Find stocks by filter", color: "#5b63f5" },
          { href: "/watchlist", label: "Watchlist", desc: "Track your stocks", color: "#26a65b" },
          { href: "/journal", label: "Journal", desc: "Review your trades", color: "#d97706" },
          { href: "/settings", label: "Settings", desc: "Broker & account", color: "#7c6af0" },
        ].map(c => (
          <button key={c.href} onClick={() => router.push(c.href)}
            className="bg-white border border-[#e8e8e6] rounded-[10px] px-4 py-3 text-left hover:border-[#ccc] transition-colors">
            <div className="text-[13px] font-semibold text-[#1c1c1a]">{c.label}</div>
            <div className="text-[11px] text-[#aaa] mt-0.5">{c.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
