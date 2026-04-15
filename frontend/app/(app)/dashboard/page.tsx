"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getMarketSummary } from "@/lib/api";
import type { MarketSummary } from "@/lib/api";
import { createClient } from "@/lib/supabase";

function NavLink({ href, label, active }: { href: string; label: string; active?: boolean }) {
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 text-[13px] rounded-md transition-colors ${
        active
          ? "bg-[#f2f2f0] text-[#1c1c1a] font-medium"
          : "text-[#888] hover:bg-[#f7f7f5] hover:text-[#1c1c1a]"
      }`}
    >
      {label}
    </Link>
  );
}

export default function DashboardPage() {
  const [market, setMarket] = useState<MarketSummary | null>(null);
  const [userName, setUserName] = useState("Trader");
  const [plan] = useState("free");
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
  ];

  return (
    <div className="min-h-screen bg-[#f2f2f0]">
      {/* Nav */}
      <nav className="h-[50px] bg-white border-b border-[#e2e2df] flex items-center px-5 gap-0">
        <div className="flex items-center gap-2 mr-8">
          <div className="w-7 h-7 bg-[#1c1c1a] rounded-[7px] flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 11L7 3L12 11" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4.5 8h5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <span className="text-[15px] font-semibold text-[#1c1c1a] tracking-tight">
            Alpha<span className="text-[#5b63f5]">Vyuh</span>
          </span>
        </div>
        <div className="flex gap-0.5">
          <NavLink href="/dashboard" label="Dashboard" active />
          <NavLink href="/scanner" label="Scanner" />
          <NavLink href="/watchlist" label="Watchlist" />
          <NavLink href="/charts/RELIANCE" label="Charts" />
          <NavLink href="/journal" label="Journal" />
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          <Link
            href="/settings/billing"
            className="text-[11px] font-semibold bg-[#eeeffe] text-[#5b63f5] px-2 py-0.5 rounded-full uppercase hover:bg-[#dddefe] transition-colors"
          >
            {plan}
          </Link>
          <div className="w-[30px] h-[30px] rounded-full bg-[#f2f2f0] border border-[#e2e2df] flex items-center justify-center text-[11px] font-semibold text-[#555]">
            {firstName[0]?.toUpperCase()}
          </div>
        </div>
      </nav>

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
