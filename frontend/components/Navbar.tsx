"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { useEffect, useState } from "react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/scanner", label: "Scanner" },
  { href: "/alerts", label: "Alerts" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/charts/RELIANCE", label: "Charts", prefix: "/charts" },
  { href: "/journal", label: "Journal" },
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

  return (
    <nav className="h-[48px] flex-shrink-0 bg-white border-b border-[#e2e2df] flex items-center px-4 z-50">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-6">
        <div className="w-[26px] h-[26px] bg-[#1c1c1a] rounded-[6px] flex items-center justify-center">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M2 11L7 3L12 11" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4.5 8h5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <span className="text-[14px] font-bold text-[#1c1c1a] tracking-tight">
          Alpha<span className="text-[#5b63f5]">Vyuh</span>
        </span>
      </div>

      {/* Nav links */}
      <div className="flex items-center gap-0.5 flex-1">
        {NAV_ITEMS.map(({ href, label, prefix }) => {
          const active = prefix
            ? pathname.startsWith(prefix)
            : pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`px-3 py-1.5 text-[13px] rounded-md transition-colors ${
                active
                  ? "bg-[#1c1c1a] text-white font-medium"
                  : "text-[#888] hover:bg-[#f7f7f5] hover:text-[#1c1c1a]"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {/* Right: billing + avatar + sign out */}
      <div className="flex items-center gap-2">
        <Link
          href="/settings/billing"
          className={`text-[12px] px-2.5 py-1 rounded-md transition-colors ${
            pathname.startsWith("/settings")
              ? "bg-[#eeeffe] text-[#5b63f5] font-medium"
              : "text-[#888] hover:bg-[#f7f7f5] hover:text-[#1c1c1a]"
          }`}
        >
          Billing
        </Link>
        <div className="w-[28px] h-[28px] rounded-full bg-[#f2f2f0] border border-[#e2e2df] flex items-center justify-center text-[11px] font-semibold text-[#555]">
          {initials}
        </div>
        <button
          onClick={signOut}
          disabled={signingOut}
          className="text-[12px] text-[#aaa] hover:text-[#e5383b] transition-colors px-2 py-1 rounded disabled:opacity-50"
        >
          {signingOut ? "..." : "Sign out"}
        </button>
      </div>
    </nav>
  );
}
