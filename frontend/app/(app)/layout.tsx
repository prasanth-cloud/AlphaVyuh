"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/scanner",   label: "Scanner"   },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/journal",   label: "Journal"   },
  { href: "/settings",  label: "Settings"  },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname.startsWith("/onboarding")) return <>{children}</>;

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: "var(--app-bg)" }}>
      <nav className="h-[48px] flex items-center px-4 gap-1 flex-shrink-0 z-50"
        style={{
          background: "rgba(13,15,20,0.80)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderBottom: "1px solid var(--app-border)",
        }}>
        <Link href="/dashboard" className="mr-4 flex items-center gap-2 flex-shrink-0">
          <svg width="30" height="20" viewBox="0 0 72 52" fill="none">
            <polyline points="2,8 28,42 36,28 62,8" stroke="var(--app-teal)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="62" cy="8" r="4.5" fill="var(--app-gain)"/>
          </svg>
          <span className="text-[13px] font-semibold tracking-tight" style={{ color: "var(--app-text1)" }}>
            Alpha<span style={{ color: "var(--app-teal)" }}>Vyuh</span>
          </span>
        </Link>

        {NAV.map(link => {
          const active = pathname.startsWith(link.href);
          return (
            <Link key={link.href} href={link.href}
              className="px-3 py-1.5 rounded-[6px] text-[12px] font-medium transition-all"
              style={{
                background: active ? "var(--app-teal-dim)" : "transparent",
                color: active ? "var(--app-teal)" : "var(--app-text2)",
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--app-text1)"; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--app-text2)"; }}>
              {link.label}
            </Link>
          );
        })}

        <div className="ml-auto flex items-center gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--app-teal)" }} />
          <span className="text-[11px]" style={{ color: "var(--app-text3)" }}>Live</span>
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold"
            style={{ background: "var(--app-surface2)", border: "1px solid var(--app-border)", color: "var(--app-text2)" }}>
            P
          </div>
        </div>
      </nav>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
