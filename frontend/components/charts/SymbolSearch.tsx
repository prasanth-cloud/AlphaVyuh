"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search } from "lucide-react";
import { searchSymbols } from "@/lib/api";
import type { SymbolSearchResult } from "@/lib/api";

type Props = {
  value: string;
  onChange: (symbol: string) => void;
  placeholder?: string;
};

export default function SymbolSearch({ value, onChange, placeholder = "Search symbol…" }: Props) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<SymbolSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep input in sync if parent changes value externally
  useEffect(() => {
    setQuery(value);
  }, [value]);

  const fetchResults = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const r = await searchSymbols(q);
      setResults(r);
      setActiveIdx(-1);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    setOpen(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fetchResults(v), 300);
  }

  function handleFocus() {
    setOpen(true);
    if (query.length >= 1) fetchResults(query);
  }

  function select(sym: string) {
    setQuery(sym);
    setOpen(false);
    setResults([]);
    onChange(sym);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIdx >= 0 && results[activeIdx]) {
        select(results[activeIdx].symbol);
      } else if (query.trim()) {
        select(query.trim().toUpperCase());
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // Close on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  function highlight(text: string, q: string) {
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <span className="text-[#5b63f5] font-semibold">{text.slice(idx, idx + q.length)}</span>
        {text.slice(idx + q.length)}
      </>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#aaa]" />
        <input
          value={query}
          onChange={handleChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-[200px] text-[13px] font-medium text-[#1c1c1a] border border-[#e2e2df] rounded-[7px] pl-8 pr-3 py-1.5 outline-none focus:border-[#5b63f5] bg-white"
        />
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full mt-1 left-0 w-[320px] bg-white border border-[#e2e2df] rounded-[8px] shadow-lg z-50 overflow-hidden">
          {results.slice(0, 8).map((r, i) => (
            <button
              key={r.symbol}
              onMouseDown={() => select(r.symbol)}
              className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors ${
                i === activeIdx ? "bg-[#eeeffe]" : "hover:bg-[#f7f7f5]"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[13px] font-semibold text-[#1c1c1a] shrink-0">
                  {highlight(r.symbol, query)}
                </span>
                <span className="text-[11px] text-[#aaa] truncate">
                  {r.company_name}
                </span>
              </div>
              {r.sector && (
                <span className="text-[10px] text-[#888] border border-[#e2e2df] rounded-full px-2 py-0.5 ml-2 shrink-0">
                  {r.sector}
                </span>
              )}
            </button>
          ))}
          {loading && (
            <div className="px-3 py-2 text-[11px] text-[#aaa]">Searching…</div>
          )}
        </div>
      )}

      {open && !loading && results.length === 0 && query.length >= 2 && (
        <div className="absolute top-full mt-1 left-0 w-[260px] bg-white border border-[#e2e2df] rounded-[8px] shadow-md z-50 px-3 py-2.5 text-[12px] text-[#aaa]">
          No symbols found
        </div>
      )}
    </div>
  );
}
