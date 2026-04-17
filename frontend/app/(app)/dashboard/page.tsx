"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getMarketSummary, getMarketMovers, getSectorBreadth } from "@/lib/api";
import type { MarketSummary, MarketMovers, SectorBreadthItem } from "@/lib/api";
import { createClient } from "@/lib/supabase";

function getMarketPhase(market: MarketSummary) {
  const ad  = market.advance_decline_ratio ?? 0;
  const e200 = market.above_ema200_pct ?? 0;
  if (ad > 1.4 && e200 > 55)
    return { label: "Bullish", color: "#26a65b", bg: "#edfaf3", desc: "Strong breadth — good conditions for longs" };
  if (ad < 0.7 || e200 < 40)
    return { label: "Bearish", color: "#e5383b", bg: "#fff0f0", desc: "Weak breadth — avoid new longs" };
  return { label: "Neutral", color: "#d97706", bg: "#fff8ec", desc: "Mixed conditions — trade selectively" };
}


export default function DashboardPage() {
  const [market, setMarket] = useState<MarketSummary | null>(null);
  const [movers, setMovers] = useState<MarketMovers | null>(null);
  const [moversTab, setMoversTab] = useState<"gainers" | "losers" | "volume_surge">("gainers");
  const [sectorBreadth, setSectorBreadth] = useState<SectorBreadthItem[]>([]);
  const [userName, setUserName] = useState("Trader");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const name =
        data.user?.user_metadata?.full_name ||
        data.user?.email?.split("@")[0] ||
        "Trader";
      setUserName(name);
    });

    getMarketSummary()
      .then((m) => { if (m) setMarket(m); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    getMarketMovers()
      .then(setMovers)
      .catch(() => { /* non-critical */ });

    getSectorBreadth()
      .then(d => { if (d?.sectors?.length) setSectorBreadth(d.sectors); })
      .catch(() => { /* non-critical */ });
  }, []);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  const sentiment = () => {
    if (!market?.advance_decline_ratio) return "";
    if (market.advance_decline_ratio > 1.3) return "Bullish";
    if (market.advance_decline_ratio < 0.7) return "Bearish";
    return "Neutral";
  };

  const firstName = userName.split(" ")[0];

  const cards = [
    {
      href: "/scanner",
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="9" width="2.5" height="5" rx="1" fill="#5b63f5" />
          <rect x="6" y="6" width="2.5" height="8" rx="1" fill="#5b63f5" />
          <rect x="10" y="3" width="2.5" height="11" rx="1" fill="#5b63f5" />
        </svg>
      ),
      iconBg: "#eeeffe",
      title: "Scanner",
      sub: "Scan 3,400+ NSE stocks with 35+ technical filters",
      badge: "Live", badgeColor: "#26a65b", badgeBg: "#edfaf3",
    },
    {
      href: "/watchlist",
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M2 10l3-4 3 3 4-6" stroke="#26a65b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="13" cy="3" r="1.5" fill="#26a65b" />
        </svg>
      ),
      iconBg: "#edfaf3",
      title: "Watchlist",
      sub: "Track your shortlisted stocks with live quotes",
      badge: "Live", badgeColor: "#26a65b", badgeBg: "#edfaf3",
    },
    {
      href: "/charts/RELIANCE",
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M2 10l3-3 2 2 4-5 2 2" stroke="#5b63f5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      iconBg: "#eeeffe",
      title: "Charts",
      sub: "Candlestick charts with EMA, RSI, MACD, BB, VWAP",
      badge: "Live", badgeColor: "#26a65b", badgeBg: "#edfaf3",
    },
    {
      href: "/journal",
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="3" y="2" width="10" height="12" rx="1.5" stroke="#5b63f5" strokeWidth="1.5" />
          <path d="M6 6h4M6 9h3" stroke="#5b63f5" strokeWidth="1" strokeLinecap="round" />
        </svg>
      ),
      iconBg: "#eeeffe",
      title: "Journal",
      sub: "Log trades, track P&L, review mistakes",
      badge: "New", badgeColor: "#5b63f5", badgeBg: "#eeeffe",
    },
    {
      href: "/alerts",
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 2a4.5 4.5 0 014.5 4.5c0 2.5.8 3.5 1.5 4.5H2c.7-1 1.5-2 1.5-4.5A4.5 4.5 0 018 2z" stroke="#5b63f5" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M6.5 11v.5a1.5 1.5 0 003 0V11" stroke="#5b63f5" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
      iconBg: "#eeeffe",
      title: "Alerts",
      sub: "Save scans and get notified after market close",
      badge: "New", badgeColor: "#5b63f5", badgeBg: "#eeeffe",
    },
    {
      href: "/options",
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M2 11 L5 5 L8 8 L11 4 L14 7" stroke="#d97706" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M11 4 L14 4 L14 7" stroke="#d97706" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      iconBg: "#fff8ec",
      title: "Options",
      sub: "Build strategies, visualise payoffs, compute Greeks",
      badge: "New", badgeColor: "#d97706", badgeBg: "#fff8ec",
    },
  ];

  return (
    <div className="min-h-full bg-[#f2f2f0]">
      {/* Market breadth strip */}
      <div className="grid grid-cols-4 gap-2.5 px-5 pt-4">
        {loading
          ? [1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white border border-[#e2e2df] rounded-[10px] px-4 py-3.5 animate-pulse">
                <div className="h-7 bg-gray-100 rounded mb-1 w-16" />
                <div className="h-3 bg-gray-100 rounded w-24" />
              </div>
            ))
          : [
              { val: market?.advances ?? 0, label: "Advances", color: "#26a65b" },
              { val: market?.declines ?? 0, label: "Declines", color: "#e5383b" },
              { val: market?.new_52w_highs ?? 0, label: "New 52W Highs", color: "#5b63f5" },
              { val: market?.new_52w_lows ?? 0, label: "New 52W Lows", color: "#d97706" },
            ].map((item) => (
              <div key={item.label} className="bg-white border border-[#e2e2df] rounded-[10px] px-4 py-3.5">
                <div
                  className="text-[22px] font-bold tracking-tight leading-none"
                  style={{ color: item.color }}
                >
                  {item.val.toLocaleString("en-IN")}
                </div>
                <div className="text-[10px] text-[#aaa] uppercase tracking-wider mt-1">{item.label}</div>
              </div>
            ))}
      </div>

      {/* Market phase banner */}
      {market && (() => {
        const phase = getMarketPhase(market);
        return (
          <div
            className="mx-5 mt-3 mb-1 px-4 py-2.5 rounded-[10px] border flex items-center gap-3"
            style={{ background: phase.bg, borderColor: phase.color + "40" }}
          >
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: phase.color }} />
            <div>
              <span className="text-[13px] font-semibold" style={{ color: phase.color }}>{phase.label} market</span>
              <span className="text-[12px] text-[#888] ml-2">{phase.desc}</span>
            </div>
            <div className="ml-auto text-[11px] text-[#aaa] hidden sm:block">
              A/D {market.advance_decline_ratio?.toFixed(2)} · {market.above_ema200_pct}% above EMA 200
            </div>
          </div>
        );
      })()}

      {/* Greeting */}
      <div className="px-5 pt-5 pb-3">
        <div className="text-[11px] text-[#aaa] mb-0.5">
          {new Date().toLocaleDateString("en-IN", {
            weekday: "long", year: "numeric", month: "long", day: "numeric",
          })}
        </div>
        <div className="text-[20px] font-semibold text-[#1c1c1a] tracking-tight">
          {greeting()}, {firstName}.
        </div>
        {market && (
          <div className="text-[13px] text-[#888] mt-0.5">
            Market breadth {sentiment().toLowerCase()} — A/D{" "}
            {market.advance_decline_ratio?.toFixed(2)} · {market.new_52w_highs} new 52W
            highs · {market.above_ema200_pct}% stocks above EMA 200
          </div>
        )}
        {error && (
          <div className="text-[12px] text-red-400 mt-1">
            Could not load market data — {error}
          </div>
        )}
      </div>

      {/* Market Movers */}
      {movers && (
        <div className="px-5 pb-4">
          <div className="bg-white border border-[#e2e2df] rounded-[10px] overflow-hidden">
            {/* Tab bar */}
            <div className="flex border-b border-[#f0f0ee]">
              {([
                { key: "gainers", label: "Top Gainers", color: "#26a65b" },
                { key: "losers", label: "Top Losers", color: "#e5383b" },
                { key: "volume_surge", label: "Volume Surge", color: "#5b63f5" },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setMoversTab(tab.key)}
                  className="flex-1 text-[12px] font-medium py-2.5 transition-colors"
                  style={moversTab === tab.key
                    ? { color: tab.color, borderBottom: `2px solid ${tab.color}`, background: "#fafafa" }
                    : { color: "#aaa", borderBottom: "2px solid transparent" }
                  }
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {/* Rows */}
            <div className="divide-y divide-[#f7f7f5]">
              {(moversTab === "gainers" ? movers.gainers
                : moversTab === "losers" ? movers.losers
                : movers.volume_surge
              ).map(row => (
                <Link
                  key={row.symbol}
                  href={`/charts/${row.symbol}`}
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-[#fafafa] transition-colors"
                >
                  <div>
                    <div className="text-[13px] font-semibold text-[#1c1c1a]">{row.symbol}</div>
                    <div className="text-[11px] text-[#aaa] truncate max-w-[160px]">{row.company_name}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[13px] font-semibold text-[#1c1c1a]">
                      ₹{row.close.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-[12px] font-medium"
                      style={{ color: row.pct_change >= 0 ? "#26a65b" : "#e5383b" }}
                    >
                      {row.pct_change >= 0 ? "+" : ""}{row.pct_change.toFixed(2)}%
                      {moversTab === "volume_surge" && row.volume_ratio != null && (
                        <span className="text-[#5b63f5] ml-1.5">{row.volume_ratio}×</span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sector Breadth */}
      {sectorBreadth.length > 0 && (
        <div className="px-5 pb-4">
          <div className="bg-white border border-[#e2e2df] rounded-[10px] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#f0f0ee] flex items-center justify-between">
              <span className="text-[13px] font-bold text-[#1c1c1a]">Sector Breadth</span>
              <span className="text-[11px] text-[#aaa]">A/D · EMA200</span>
            </div>
            <div className="divide-y divide-[#f7f7f5]">
              {sectorBreadth.slice(0, 10).map(s => {
                const total = s.advances + s.declines + s.unchanged;
                const advPct = total > 0 ? (s.advances / total) * 100 : 0;
                const decPct = total > 0 ? (s.declines / total) * 100 : 0;
                const bullish = (s.ad_ratio ?? 0) > 1.2;
                const bearish = (s.ad_ratio ?? 1) < 0.8;
                return (
                  <div key={s.sector} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="w-[130px] text-[12px] font-medium text-[#1c1c1a] truncate">{s.sector}</div>
                    {/* A/D bar */}
                    <div className="flex-1 h-[5px] rounded-full bg-[#f0f0ee] overflow-hidden">
                      <div className="h-full flex">
                        <div className="h-full bg-[#26a65b] rounded-l-full" style={{ width: `${advPct}%` }} />
                        <div className="h-full bg-[#e5383b] rounded-r-full" style={{ width: `${decPct}%` }} />
                      </div>
                    </div>
                    <div className="w-[48px] text-right text-[11px] font-semibold tabular-nums"
                      style={{ color: bullish ? "#26a65b" : bearish ? "#e5383b" : "#888" }}>
                      {s.ad_ratio != null ? `${s.ad_ratio}x` : "—"}
                    </div>
                    {s.above_ema200_pct != null && (
                      <div className="w-[38px] text-right text-[11px] tabular-nums text-[#5b63f5]">
                        {s.above_ema200_pct}%
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Top movers strip */}
      {movers && movers.gainers.length > 0 && (
        <div className="px-5 pb-4">
          <div className="text-[11px] uppercase tracking-wider text-[#aaa] mb-2">Top movers today</div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {movers.gainers.slice(0, 6).map(stock => (
              <Link
                key={stock.symbol}
                href={`/charts/${stock.symbol}`}
                className="flex-shrink-0 bg-white border border-[#e2e2df] rounded-[10px] px-4 py-3 hover:border-[#bbb] transition-colors min-w-[110px]"
              >
                <div className="text-[13px] font-semibold text-[#1c1c1a]">{stock.symbol}</div>
                <div className={`text-[13px] font-semibold mt-0.5 ${stock.pct_change >= 0 ? "text-[#26a65b]" : "text-[#e5383b]"}`}>
                  {stock.pct_change >= 0 ? "+" : ""}{stock.pct_change.toFixed(2)}%
                </div>
                {stock.volume_ratio != null && (
                  <div className="text-[11px] text-[#aaa] mt-0.5">Vol {stock.volume_ratio}×</div>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Module cards */}
      <div className="grid grid-cols-2 gap-2.5 px-5 pb-5">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="bg-white border border-[#e2e2df] rounded-[10px] p-[18px] hover:border-[#bbb] transition-colors block"
          >
            <div
              className="w-[34px] h-[34px] rounded-[8px] flex items-center justify-center mb-3"
              style={{ background: card.iconBg }}
            >
              {card.icon}
            </div>
            <div className="text-[14px] font-semibold text-[#1c1c1a] mb-0.5">{card.title}</div>
            <div className="text-[12px] text-[#aaa] leading-relaxed">{card.sub}</div>
            <div
              className="inline-flex items-center gap-1.5 text-[11px] font-medium mt-2 px-2 py-0.5 rounded-full"
              style={{ color: card.badgeColor, background: card.badgeBg }}
            >
              {card.badge === "Live" && (
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: card.badgeColor }} />
              )}
              {card.badge}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
