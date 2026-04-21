"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { LogoFull } from "@/components/ui/Logo";

const NAV_ITEMS = [
  {
    href: "/dashboard", label: "Dashboard", prefix: "/dashboard",
    icon: (active: boolean) => (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="1" width="6" height="6" rx="1.5" fill={active ? '#5b63f5' : '#555'} />
        <rect x="9" y="1" width="6" height="6" rx="1.5" fill={active ? '#5b63f5' : '#555'} />
        <rect x="1" y="9" width="6" height="6" rx="1.5" fill={active ? '#5b63f5' : '#555'} />
        <rect x="9" y="9" width="6" height="6" rx="1.5" fill={active ? '#818cf8' : '#333'} />
      </svg>
    ),
  },
  {
    href: "/scanner", label: "Scanner", prefix: "/scanner",
    icon: (active: boolean) => (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="7" width="3" height="8" rx="1" fill={active ? '#5b63f5' : '#555'} />
        <rect x="6" y="4" width="3" height="11" rx="1" fill={active ? '#5b63f5' : '#555'} />
        <rect x="11" y="9" width="3" height="6" rx="1" fill={active ? '#5b63f5' : '#555'} />
      </svg>
    ),
  },
  {
    href: "/watchlist", label: "Watchlist", prefix: "/watchlist",
    icon: (active: boolean) => (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <path d="M1 13l3-5 3 3 4-7 3 2" stroke={active ? '#5b63f5' : '#555'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <circle cx="14" cy="3" r="1.5" fill={active ? '#26a65b' : '#444'} />
      </svg>
    ),
  },
  {
    href: "/charts/RELIANCE", label: "Charts", prefix: "/charts",
    icon: (active: boolean) => (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <path d="M1 12l3-4 2 2 4-6 2 2" stroke={active ? '#5b63f5' : '#555'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
    ),
  },
  {
    href: "/journal", label: "Journal", prefix: "/journal",
    icon: (active: boolean) => (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="1" width="12" height="14" rx="2" stroke={active ? '#5b63f5' : '#555'} strokeWidth="1.3" fill="none"/>
        <line x1="5" y1="6" x2="11" y2="6" stroke={active ? '#5b63f5' : '#555'} strokeWidth="1" strokeLinecap="round"/>
        <line x1="5" y1="9" x2="9" y2="9" stroke={active ? '#5b63f5' : '#555'} strokeWidth="1" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: "/alerts", label: "Alerts", prefix: "/alerts",
    icon: (active: boolean) => (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <path d="M8 2a4.5 4.5 0 014.5 4.5c0 2.5.8 3.5 1.5 4.5H2c.7-1 1.5-2 1.5-4.5A4.5 4.5 0 018 2z" stroke={active ? '#5b63f5' : '#555'} strokeWidth="1.3" strokeLinejoin="round" fill="none"/>
        <path d="M6.5 11v.5a1.5 1.5 0 003 0V11" stroke={active ? '#5b63f5' : '#555'} strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: "/options", label: "Options", prefix: "/options",
    icon: (active: boolean) => (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <path d="M2 11L5 5L8 8L11 4L14 7" stroke={active ? '#d97706' : '#555'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [initials, setInitials] = useState("U");

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      const email = data.user?.email ?? "";
      setInitials(email[0]?.toUpperCase() ?? "U");
    });
  }, []);

  async function signOut() {
    setSigningOut(true);
    await createClient().auth.signOut();
    router.push("/login");
  }

  const isActive = (item: typeof NAV_ITEMS[0]) =>
    pathname.startsWith(item.prefix);

  return (
    <nav className="h-[48px] flex-shrink-0 bg-[#0f0f0e] border-b border-[#1c1c1a] flex items-center px-4 gap-1 z-50">
      {/* Logo */}
      <div className="mr-5 flex-shrink-0">
        <LogoFull onDark size="sm" />
      </div>

      {/* Nav links */}
      <div className="flex items-center gap-0.5 flex-1">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] text-[12px] font-medium transition-all ${
                active
                  ? "bg-[#5b63f520] text-white"
                  : "text-[#555553] hover:bg-[#1a1a18] hover:text-[#999997]"
              }`}
            >
              {item.icon(active)}
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Market live indicator */}
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[#26a65b] animate-pulse" />
          <span className="text-[11px] text-[#555553]">Live</span>
        </div>

        {/* Settings link */}
        <Link
          href="/settings"
          className={`text-[11px] px-2 py-1 rounded-[5px] transition-colors ${
            pathname.startsWith("/settings")
              ? "bg-[#5b63f520] text-[#818cf8]"
              : "text-[#555553] hover:text-[#999997]"
          }`}
        >
          Settings
        </Link>

        {/* User avatar */}
        <div className="w-[28px] h-[28px] rounded-full bg-[#1a1a18] border border-[#333] flex items-center justify-center text-[11px] font-bold text-[#888]">
          {initials}
        </div>

        {/* Sign out */}
        <button
          onClick={signOut}
          disabled={signingOut}
          className="text-[11px] text-[#555553] hover:text-[#e5383b] transition-colors px-1.5 py-1 rounded disabled:opacity-50"
        >
          {signingOut ? "…" : "Sign out"}
        </button>
      </div>
    </nav>
  );
}
