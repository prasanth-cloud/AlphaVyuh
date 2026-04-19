"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useRef } from "react";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/scanner",   label: "Scanner"   },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/journal",   label: "Journal"   },
];

type SymbolResult = { symbol: string; company_name: string; sector: string };

function SymbolSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SymbolResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout>>();

  async function search(q: string) {
    if (!q || q.length < 1) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const { createClient } = await import("@/lib/supabase");
      const sb = createClient();
      const { data } = await sb
        .from("stock_universe")
        .select("symbol, company_name, sector")
        .or(`symbol.ilike.${q}%,company_name.ilike.%${q}%`)
        .eq("is_active", true)
        .limit(8);
      setResults(data || []);
      setOpen(true);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value.toUpperCase();
    setQuery(q);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => search(q), 250);
  }

  function select(symbol: string) {
    setQuery("");
    setResults([]);
    setOpen(false);
    router.push(`/watchlist?symbol=${symbol}`);
  }

  return (
    <div style={{ position: "relative", flex: "0 0 240px" }}>
      <input
        value={query}
        onChange={handleChange}
        onKeyDown={e => {
          if (e.key === "Escape") { setOpen(false); setQuery(""); }
          if (e.key === "Enter" && results[0]) select(results[0].symbol);
        }}
        placeholder={loading ? "Searching…" : "Search symbol…"}
        style={{
          width: "100%", padding: "5px 12px",
          background: "var(--app-surface2)",
          border: "1px solid var(--app-border)",
          borderRadius: 7, fontSize: 12,
          color: "var(--app-text)", outline: "none",
        }}
        onFocus={() => query && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && results.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0,
          background: "var(--app-surface)", border: "1px solid var(--app-border)",
          borderRadius: 8, marginTop: 4, zIndex: 200, overflow: "hidden",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}>
          {results.map(r => (
            <div
              key={r.symbol}
              onMouseDown={() => select(r.symbol)}
              style={{
                padding: "8px 12px", cursor: "pointer",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                borderBottom: "1px solid var(--app-border)",
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--app-surface2)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--app-text)", fontFamily: "monospace" }}>{r.symbol}</div>
                <div style={{ fontSize: 10, color: "var(--app-text3)" }}>{r.company_name}</div>
              </div>
              <div style={{ fontSize: 10, color: "var(--app-text3)", textAlign: "right", maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sector}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname.startsWith("/onboarding")) return <>{children}</>;

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: "var(--app-bg)" }}>
      <nav
        className="h-[48px] flex items-center px-4 gap-2 flex-shrink-0 z-50"
        style={{
          background: "rgba(13,15,20,0.90)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderBottom: "1px solid var(--app-border)",
        }}
      >
        {/* Logo */}
        <Link href="/dashboard" className="mr-3 flex items-center gap-2 flex-shrink-0">
          <svg width="30" height="20" viewBox="0 0 72 52" fill="none">
            <polyline points="2,8 28,42 36,28 62,8" stroke="var(--app-teal)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="62" cy="8" r="4.5" fill="var(--app-gain)"/>
          </svg>
          <span className="text-[13px] font-semibold tracking-tight" style={{ color: "var(--app-text1)" }}>
            Alpha<span style={{ color: "var(--app-teal)" }}>Vyuh</span>
          </span>
        </Link>

        {/* 4 nav links */}
        {NAV.map(link => {
          const active = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className="px-3 py-1.5 rounded-[6px] text-[12px] font-medium transition-all flex-shrink-0"
              style={{
                background: active ? "var(--app-teal-dim)" : "transparent",
                color: active ? "var(--app-teal)" : "var(--app-text2)",
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--app-text1)"; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--app-text2)"; }}
            >
              {link.label}
            </Link>
          );
        })}

        {/* Symbol search — center */}
        <div className="flex-1 flex justify-center px-2">
          <SymbolSearch />
        </div>

        {/* Right side — live dot + settings avatar */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--app-teal)" }} />
          <span className="text-[11px]" style={{ color: "var(--app-text3)" }}>Live</span>
          <Link
            href="/settings"
            className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors"
            style={{ background: "var(--app-surface2)", border: "1px solid var(--app-border)", color: "var(--app-text2)" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--app-teal)"; (e.currentTarget as HTMLElement).style.color = "var(--app-teal)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--app-border)"; (e.currentTarget as HTMLElement).style.color = "var(--app-text2)"; }}
          >
            P
          </Link>
        </div>
      </nav>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
