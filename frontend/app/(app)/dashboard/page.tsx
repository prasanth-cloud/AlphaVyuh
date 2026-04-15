"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { getMarketSummary } from "@/lib/api";
import type { MarketSummary } from "@/lib/api";
import {
  BarChart2, BookOpen, Link2, ScanLine,
  ChevronDown, LogOut, Settings, TrendingUp, TrendingDown,
  Activity, Minus,
} from "lucide-react";

type UserProfile = {
  id: string;
  email: string;
  full_name: string | null;
  plan: string;
  onboarding_completed: boolean;
};

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [market, setMarket] = useState<MarketSummary | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        window.location.replace("/login");
        return;
      }

      const [{ data: profile }] = await Promise.all([
        supabase
          .from("users")
          .select("id, email, full_name, plan, onboarding_completed")
          .eq("id", data.session.user.id)
          .single(),
      ]);

      if (!profile) {
        window.location.replace("/login");
        return;
      }
      if (!profile.onboarding_completed) {
        window.location.replace("/onboarding");
        return;
      }
      setUser(profile);

      // Load market summary in parallel (non-blocking)
      getMarketSummary().then(m => setMarket(m));
    });
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.replace("/login");
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#f2f2f0] flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-[#5b63f5] border-t-transparent animate-spin" />
      </div>
    );
  }

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const initials = (user.full_name ?? user.email)
    .split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();

  const adRatio = market?.advance_decline_ratio;
  const marketMood =
    adRatio == null ? null
    : adRatio > 1.5 ? { label: "Bullish breadth", color: "#26a65b" }
    : adRatio < 0.67 ? { label: "Bearish breadth", color: "#e5383b" }
    : { label: "Mixed market", color: "#d97706" };

  return (
    <div className="min-h-screen bg-[#f2f2f0]">
      {/* Top Nav */}
      <nav className="bg-white border-b border-[#e2e2df] sticky top-0 z-20">
        <div className="max-w-[1200px] mx-auto px-5 h-13 flex items-center justify-between" style={{ height: "52px" }}>
          <div className="flex items-center gap-7">
            <span className="text-[15px] font-bold tracking-tight text-[#1c1c1a]">AlphaVyuh</span>
            <div className="hidden md:flex items-center gap-1">
              {[
                { label: "Dashboard", href: "/dashboard", active: true },
                { label: "Scanner", href: "/scanner", active: true },
                { label: "Watchlist", href: "/watchlist", active: true },
                { label: "Charts", href: "/charts/RELIANCE", active: true },
                { label: "Journal", href: null },
              ].map(item => (
                item.href ? (
                  <a
                    key={item.label}
                    href={item.href}
                    className="px-3 py-1.5 rounded-[6px] text-[13px] font-medium text-[#444] hover:bg-[#f2f2f0] hover:text-[#1c1c1a] transition-colors"
                  >
                    {item.label}
                  </a>
                ) : (
                  <span
                    key={item.label}
                    className="px-3 py-1.5 text-[13px] text-[#bbb] cursor-not-allowed"
                  >
                    {item.label}
                  </span>
                )
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
              user.plan === "pro"
                ? "border-[#5b63f5] text-[#5b63f5] bg-[#eeeffe]"
                : "border-[#e2e2df] text-[#888]"
            }`}>
              {user.plan.toUpperCase()}
            </span>
            <div className="relative" ref={dropRef}>
              <button
                onClick={() => setDropdownOpen(o => !o)}
                className="flex items-center gap-1.5 rounded-full px-2 py-1 hover:bg-[#f2f2f0] transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-[#1c1c1a] flex items-center justify-center text-[11px] font-bold text-white">
                  {initials}
                </div>
                <ChevronDown size={13} className="text-[#888]" />
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-44 bg-white border border-[#e2e2df] rounded-[10px] shadow-lg overflow-hidden z-30">
                  <div className="px-3 py-2.5 border-b border-[#f0f0ee]">
                    <p className="text-[11px] text-[#aaa] truncate">{user.email}</p>
                  </div>
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-[13px] text-[#444] hover:bg-[#f7f7f5]"
                    onClick={() => router.push("/settings/billing")}
                  >
                    <Settings size={14} /> Settings
                  </button>
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-[13px] text-[#e5383b] hover:bg-[#f7f7f5]"
                    onClick={handleLogout}
                  >
                    <LogOut size={14} /> Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-[1200px] mx-auto px-5 py-7 space-y-6">
        {/* Greeting */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-[22px] font-bold text-[#1c1c1a]">
              Good {getTimeGreeting()}, {user.full_name?.split(" ")[0] ?? "Trader"}
            </h1>
            <p className="text-[13px] text-[#aaa] mt-0.5">{today}</p>
          </div>
          {marketMood && (
            <div
              className="text-[12px] font-medium px-3 py-1.5 rounded-full border"
              style={{ color: marketMood.color, borderColor: marketMood.color + "44", background: marketMood.color + "11" }}
            >
              {marketMood.label}
            </div>
          )}
        </div>

        {/* Market breadth strip */}
        <div className="grid grid-cols-4 gap-3">
          <BreadthCard
            label="Advances"
            value={market?.advances}
            icon={<TrendingUp size={15} className="text-[#26a65b]" />}
            color="#26a65b"
            bg="#edfaf3"
          />
          <BreadthCard
            label="Declines"
            value={market?.declines}
            icon={<TrendingDown size={15} className="text-[#e5383b]" />}
            color="#e5383b"
            bg="#fff0f0"
          />
          <BreadthCard
            label="52W Highs"
            value={market?.new_52w_highs}
            icon={<Activity size={15} className="text-[#5b63f5]" />}
            color="#5b63f5"
            bg="#eeeffe"
          />
          <BreadthCard
            label="Above EMA 200"
            value={market?.above_ema200_pct != null ? `${market.above_ema200_pct.toFixed(1)}%` : undefined}
            icon={<Minus size={15} className="text-[#888]" />}
            color="#888"
            bg="#f7f7f5"
          />
        </div>

        {/* Module cards */}
        <div>
          <h2 className="text-[13px] font-semibold text-[#888] uppercase tracking-[0.4px] mb-3">Modules</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                icon: ScanLine,
                title: "Scanner",
                desc: "Scan NSE stocks with custom filters",
                href: "/scanner",
                live: true,
              },
              {
                icon: BookOpen,
                title: "Watchlist",
                desc: "Track and monitor your stock picks",
                href: "/watchlist",
                live: true,
              },
              {
                icon: BarChart2,
                title: "Charts",
                desc: "Interactive price charts",
                href: "/charts/RELIANCE",
                live: true,
              },
              {
                icon: Link2,
                title: "Broker Connect",
                desc: "Place orders directly",
                href: null,
                live: false,
              },
            ].map(({ icon: Icon, title, desc, href, live }) => (
              <div
                key={title}
                onClick={() => href && router.push(href)}
                className={`bg-white border border-[#e2e2df] rounded-[10px] p-4 flex flex-col gap-3 transition-all ${
                  live
                    ? "cursor-pointer hover:border-[#5b63f5] hover:shadow-sm"
                    : "opacity-60 cursor-not-allowed"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className={`w-9 h-9 rounded-[8px] flex items-center justify-center ${live ? "bg-[#eeeffe]" : "bg-[#f7f7f5]"}`}>
                    <Icon size={17} className={live ? "text-[#5b63f5]" : "text-[#aaa]"} />
                  </div>
                  {!live && (
                    <span className="text-[10px] text-[#bbb] border border-[#e2e2df] rounded-full px-2 py-0.5">
                      Soon
                    </span>
                  )}
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-[#1c1c1a]">{title}</div>
                  <div className="text-[11px] text-[#aaa] mt-0.5 leading-snug">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Free plan banner */}
        {user.plan === "free" && (
          <div className="bg-white border border-[#e2e2df] rounded-[10px] p-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-[13px] font-semibold text-[#1c1c1a]">Unlock Pro</div>
              <div className="text-[12px] text-[#888] mt-0.5">
                More scanner results, unlimited watchlists, and advanced indicators.
              </div>
            </div>
            <a
              href="/settings/billing"
              className="px-4 py-2 rounded-[7px] bg-[#1c1c1a] text-white text-[12px] font-medium hover:opacity-85 transition-opacity whitespace-nowrap"
            >
              Upgrade to Pro
            </a>
          </div>
        )}
      </main>
    </div>
  );
}

function getTimeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

function BreadthCard({
  label,
  value,
  icon,
  color,
  bg,
}: {
  label: string;
  value?: number | string;
  icon: React.ReactNode;
  color: string;
  bg: string;
}) {
  return (
    <div className="bg-white border border-[#e2e2df] rounded-[10px] px-4 py-3.5 flex items-center gap-3">
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: bg }}>
        {icon}
      </div>
      <div>
        <div className="text-[10px] text-[#aaa] uppercase tracking-[0.4px]">{label}</div>
        <div className="text-[16px] font-bold tabular-nums mt-0.5" style={{ color }}>
          {value != null ? value : <span className="text-[#ddd] text-[13px] font-normal">—</span>}
        </div>
      </div>
    </div>
  );
}
