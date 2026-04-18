"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase";
import Link from "next/link";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/scanner",   label: "Scanner"   },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/journal",   label: "Journal"   },
  { href: "/settings",  label: "Settings"  },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [initial, setInitial]   = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.replace("/login"); return; }
      if (!pathname.startsWith("/onboarding")) {
        const { data: profile } = await supabase
          .from("users").select("onboarding_completed").eq("id", data.user.id).single();
        if (profile && profile.onboarding_completed === false) {
          router.replace("/onboarding"); return;
        }
      }
      setInitial((data.user.email?.[0] ?? "U").toUpperCase());
      setChecking(false);
    });
  }, [router, pathname]);

  if (checking) {
    return (
      <div className="min-h-screen bg-[#0f0f0e] flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-[#5b63f5] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (pathname.startsWith("/onboarding")) return <>{children}</>;

  return (
    <div className="h-screen flex flex-col bg-[#f2f2f0] overflow-hidden">
      {/* Nav */}
      <nav className="h-[48px] bg-[#0f0f0e] flex items-center px-4 gap-1 flex-shrink-0 border-b border-[#1a1a18] z-50">
        {/* Logo */}
        <Link href="/dashboard" className="mr-4 flex items-center gap-2 flex-shrink-0">
          <svg width="30" height="20" viewBox="0 0 72 52" fill="none">
            <polyline points="2,8 28,42 36,28 62,8" stroke="#5b63f5" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="62" cy="8" r="4.5" fill="#26a65b"/>
          </svg>
          <span className="text-[13px] font-semibold text-white tracking-tight">
            Alpha<span className="text-[#818cf8]">Vyuh</span>
          </span>
        </Link>

        {/* Nav links */}
        {NAV.map(link => {
          const active = pathname.startsWith(link.href);
          return (
            <Link key={link.href} href={link.href}
              className={`px-3 py-1.5 rounded-[6px] text-[12px] font-medium transition-all ${
                active
                  ? "bg-[rgba(91,99,245,0.15)] text-white"
                  : "text-[#555553] hover:text-[#aaa] hover:bg-[#1a1a18]"
              }`}>
              {link.label}
            </Link>
          );
        })}

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#26a65b] animate-pulse" />
          <span className="text-[11px] text-[#444]">Live</span>
          <div className="w-7 h-7 rounded-full bg-[#1a1a18] border border-[#2a2a28] flex items-center justify-center text-[11px] font-bold text-[#888]">
            {initial}
          </div>
        </div>
      </nav>

      {/* Page content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
