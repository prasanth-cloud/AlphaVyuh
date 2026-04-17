"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { runScan, addToWatchlist, getWatchlists } from "@/lib/api";
import type { ScanFilters, Watchlist } from "@/lib/api";

// ─── PRESET DEFINITIONS ─────────────────────────────────────────────────────

const PRESETS = [
  {
    id: "momentum",
    label: "Momentum",
    description: "Strong stocks trending up with high volume",
    icon: "↑",
    color: "#26a65b",
    bg: "#edfaf3",
    filters: {
      rsi_min: 55,
      rsi_max: 80,
      volume_ratio_min: 1.5,
      price_vs_ema20: "above",
      price_vs_ema50: "above",
    },
  },
  {
    id: "breakout",
    label: "Breakout",
    description: "Stocks breaking out with 2x+ volume",
    icon: "⚡",
    color: "#5b63f5",
    bg: "#eeeffe",
    filters: {
      pct_change_min: 2.0,
      volume_ratio_min: 2.0,
      price_vs_ema20: "above",
    },
  },
  {
    id: "near_high",
    label: "Near 52W High",
    description: "Within 5% of yearly high — potential breakout zone",
    icon: "▲",
    color: "#d97706",
    bg: "#fff8ec",
    filters: {
      week_52_high_pct_max: 5,
      volume_ratio_min: 1.0,
    },
  },
  {
    id: "oversold",
    label: "Oversold Bounce",
    description: "Low RSI in uptrending stocks — potential reversal",
    icon: "↩",
    color: "#e5383b",
    bg: "#fff0f0",
    filters: {
      rsi_min: 20,
      rsi_max: 40,
      price_vs_ema200: "above",
    },
  },
  {
    id: "new_highs",
    label: "New Highs",
    description: "Stocks hitting fresh 52-week highs today",
    icon: "★",
    color: "#7c3aed",
    bg: "#f5f3ff",
    filters: {
      new_52w_high: true,
    },
  },
] as const;

type PresetId = (typeof PRESETS)[number]["id"];

// ─── ADVANCED FILTERS ────────────────────────────────────────────────────────

const EMPTY_ADV = {
  price_min: "",
  price_max: "",
  pct_change_min: "",
  pct_change_max: "",
  volume_ratio_min: "",
  rsi_min: "",
  rsi_max: "",
  price_vs_ema20: "",
  price_vs_ema50: "",
  price_vs_ema200: "",
};

type AdvFilters = typeof EMPTY_ADV;

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function mergeFilters(presetId: PresetId, adv: AdvFilters): ScanFilters {
  const preset = PRESETS.find((p) => p.id === presetId)!;
  const base: Record<string, unknown> = { ...preset.filters };

  if (adv.price_min !== "")        base.price_min        = parseFloat(adv.price_min);
  if (adv.price_max !== "")        base.price_max        = parseFloat(adv.price_max);
  if (adv.pct_change_min !== "")   base.pct_change_min   = parseFloat(adv.pct_change_min);
  if (adv.pct_change_max !== "")   base.pct_change_max   = parseFloat(adv.pct_change_max);
  if (adv.volume_ratio_min !== "") base.volume_ratio_min = parseFloat(adv.volume_ratio_min);
  if (adv.rsi_min !== "")          base.rsi_min          = parseFloat(adv.rsi_min);
  if (adv.rsi_max !== "")          base.rsi_max          = parseFloat(adv.rsi_max);
  if (adv.price_vs_ema20 !== "")   base.price_vs_ema20   = adv.price_vs_ema20;
  if (adv.price_vs_ema50 !== "")   base.price_vs_ema50   = adv.price_vs_ema50;
  if (adv.price_vs_ema200 !== "")  base.price_vs_ema200  = adv.price_vs_ema200;

  return base as ScanFilters;
}

function getRSIStyle(rsi: number) {
  if (rsi > 70) return { bg: "#eeeffe", color: "#5b63f5" };
  if (rsi < 35) return { bg: "#fff8ec", color: "#d97706" };
  return { bg: "#edfaf3", color: "#26a65b" };
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function ScannerPage() {
  const router = useRouter();

  const [activePreset, setActivePreset] = useState<PresetId>("momentum");
  const [results, setResults]           = useState<Record<string, unknown>[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [tradeDate, setTradeDate]       = useState("");
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [adv, setAdv]                   = useState<AdvFilters>(EMPTY_ADV);
  const [sortBy, setSortBy]             = useState("volume_ratio");
  const [watchlists, setWatchlists]     = useState<Watchlist[]>([]);
  const [addingToWl, setAddingToWl]     = useState<string | null>(null);
  const [toast, setToast]               = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const loadWatchlists = useCallback(async () => {
    try {
      // getWatchlists() returns Watchlist[] directly (already unwrapped in api.ts)
      const data = await getWatchlists();
      setWatchlists(Array.isArray(data) ? data : []);
    } catch { /* non-critical */ }
  }, []);

  const doScan = useCallback(async (presetId: PresetId, sort: string, advFilters: AdvFilters) => {
    setLoading(true);
    setError("");
    try {
      const filters = mergeFilters(presetId, advFilters);
      const data = await runScan(filters, sort);
      setResults(data.results || []);
      setTotalMatches(data.total_matches || 0);
      setTradeDate(data.trade_date || "");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Scan failed";
      setError(
        msg.includes("404") || msg.includes("500")
          ? "Market data loading — try again in a moment."
          : msg
      );
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Run Momentum preset automatically on page load
  useEffect(() => {
    doScan("momentum", "volume_ratio", EMPTY_ADV);
    loadWatchlists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchPreset = (id: PresetId) => {
    setActivePreset(id);
    doScan(id, sortBy, adv);
  };

  const applyAdvanced = () => doScan(activePreset, sortBy, adv);

  const resetAdvanced = () => {
    setAdv(EMPTY_ADV);
    doScan(activePreset, sortBy, EMPTY_ADV);
  };

  const changeSort = (col: string) => {
    setSortBy(col);
    doScan(activePreset, col, adv);
  };

  const handleAddToWatchlist = async (symbol: string) => {
    if (!watchlists.length) {
      showToast("No watchlist found — create one first");
      return;
    }
    setAddingToWl(symbol);
    try {
      await addToWatchlist(watchlists[0].id, symbol);
      showToast(`${symbol} added to ${watchlists[0].name}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      showToast(msg.includes("409") ? `${symbol} already in watchlist` : `Failed to add ${symbol}`);
    } finally {
      setAddingToWl(null);
    }
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f2f2f0]">

      <div className="max-w-[1280px] mx-auto px-5 py-4">

        {/* ── PRESET CARDS ── */}
        <div className="grid grid-cols-5 gap-2.5 mb-4">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => switchPreset(preset.id)}
              className="text-left p-4 rounded-[12px] transition-all"
              style={
                activePreset === preset.id
                  ? { border: `2px solid ${preset.color}`, background: preset.bg, boxShadow: `0 0 0 3px ${preset.color}15` }
                  : { border: "1px solid #e8e8e6", background: "white" }
              }
            >
              <div className="text-[22px] mb-2 leading-none">{preset.icon}</div>
              <div className="text-[13px] font-semibold text-[#0f0f0e] mb-0.5">{preset.label}</div>
              <div className="text-[11px] text-[#aaa] leading-tight">{preset.description}</div>
            </button>
          ))}
        </div>

        {/* ── RESULTS PANEL ── */}
        <div className="bg-white border border-[#e8e8e6] rounded-[12px] overflow-hidden">

          {/* Header row */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[#f2f2f0]">
            <div className="flex-1 flex items-center gap-2">
              {loading ? (
                <span className="text-[13px] text-[#aaa]">Scanning…</span>
              ) : error ? (
                <span className="text-[13px] text-[#e5383b]">{error}</span>
              ) : (
                <>
                  <span className="text-[13px] font-semibold text-[#0f0f0e]">{totalMatches} stocks</span>
                  <span className="text-[13px] text-[#aaa]">matched</span>
                  {tradeDate && (
                    <span className="text-[11px] text-[#aaa] ml-1">· EOD {tradeDate}</span>
                  )}
                </>
              )}
            </div>

            {/* Sort chips */}
            <div className="flex gap-1">
              {[
                { key: "volume_ratio", label: "Vol ratio" },
                { key: "pct_change",   label: "% Change" },
                { key: "rsi_14",       label: "RSI" },
              ].map((s) => (
                <button
                  key={s.key}
                  onClick={() => changeSort(s.key)}
                  className="text-[11px] px-3 py-1 rounded-full border transition-colors"
                  style={
                    sortBy === s.key
                      ? { background: "#0f0f0e", borderColor: "#0f0f0e", color: "#fff" }
                      : { borderColor: "#e8e8e6", color: "#888" }
                  }
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Refine toggle */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-[7px] border transition-colors"
              style={
                showAdvanced
                  ? { background: "#f2f2f0", borderColor: "#bbb", color: "#0f0f0e", fontWeight: 500 }
                  : { borderColor: "#e2e2df", color: "#888" }
              }
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 3h10M3 6h6M5 9h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Refine
            </button>
          </div>

          {/* Advanced filters */}
          {showAdvanced && (
            <div className="px-4 py-3 bg-[#fafaf9] border-b border-[#f2f2f0]">
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-3">
                {(
                  [
                    { label: "Price min (₹)", key: "price_min" },
                    { label: "Price max (₹)", key: "price_max" },
                    { label: "RSI min",        key: "rsi_min" },
                    { label: "RSI max",        key: "rsi_max" },
                    { label: "Vol ratio min",  key: "volume_ratio_min" },
                    { label: "% change min",   key: "pct_change_min" },
                  ] as { label: string; key: keyof AdvFilters }[]
                ).map((f) => (
                  <div key={f.key}>
                    <label className="text-[10px] uppercase tracking-wider text-[#aaa] mb-1 block">
                      {f.label}
                    </label>
                    <input
                      type="number"
                      value={adv[f.key]}
                      onChange={(e) =>
                        setAdv((prev) => ({ ...prev, [f.key]: e.target.value }))
                      }
                      placeholder="Any"
                      className="w-full px-2 py-1.5 border border-[#e8e8e6] rounded-[5px] text-[12px] bg-white focus:border-[#5b63f5] outline-none"
                    />
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-3 items-end">
                {(["20", "50", "200"] as const).map((n) => {
                  const key = `price_vs_ema${n}` as keyof AdvFilters;
                  return (
                    <div key={n}>
                      <label className="text-[10px] uppercase tracking-wider text-[#aaa] mb-1 block">
                        vs EMA{n}
                      </label>
                      <div className="flex border border-[#e8e8e6] rounded-[5px] overflow-hidden">
                        {(["above", "any", "below"] as const).map((v) => (
                          <button
                            key={v}
                            onClick={() =>
                              setAdv((prev) => ({ ...prev, [key]: v === "any" ? "" : v }))
                            }
                            className="px-2 py-1.5 text-[11px] capitalize transition-colors"
                            style={
                              (adv[key] || "any") === v
                                ? { background: "#0f0f0e", color: "#fff" }
                                : { color: "#888" }
                            }
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
                <button
                  onClick={applyAdvanced}
                  className="px-4 py-1.5 bg-[#0f0f0e] text-white text-[12px] font-medium rounded-[7px] hover:opacity-85"
                >
                  Apply
                </button>
                <button
                  onClick={resetAdvanced}
                  className="px-3 py-1.5 text-[12px] text-[#888] hover:text-[#0f0f0e]"
                >
                  Reset
                </button>
              </div>
            </div>
          )}

          {/* Results */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-6">
                <div className="animate-pulse space-y-2">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="flex gap-4 py-2">
                      <div className="h-4 bg-[#f0f0ee] rounded w-28" />
                      <div className="h-4 bg-[#f0f0ee] rounded w-20 ml-auto" />
                      <div className="h-4 bg-[#f0f0ee] rounded w-16" />
                      <div className="h-4 bg-[#f0f0ee] rounded w-14" />
                      <div className="h-4 bg-[#f0f0ee] rounded w-10" />
                    </div>
                  ))}
                </div>
              </div>
            ) : results.length === 0 && !error ? (
              <div className="flex flex-col items-center py-16 text-center">
                <div className="text-[14px] font-medium text-[#0f0f0e] mb-1">No stocks matched</div>
                <div className="text-[12px] text-[#aaa]">
                  Try a different preset or relax the advanced filters
                </div>
              </div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[#e8e8e6]">
                    {[
                      { label: "Symbol",       w: "w-44" },
                      { label: "Price",        w: "w-24" },
                      { label: "% Change",     w: "w-24" },
                      { label: "Volume ratio", w: "w-28" },
                      { label: "RSI 14",       w: "w-20" },
                      { label: "Trend",        w: "w-24" },
                      { label: "52W high",     w: "w-24" },
                      { label: "",             w: "w-24" },
                    ].map((h) => (
                      <th
                        key={h.label || "action"}
                        className={`${h.w} text-left px-3 py-2.5 text-[10px] uppercase tracking-wider text-[#aaa] font-semibold bg-white`}
                      >
                        {h.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((row, i) => (
                    <tr
                      key={i}
                      onClick={() => router.push(`/charts/${row.symbol}`)}
                      className="border-b border-[#f2f2f0] hover:bg-[#fafaf9] cursor-pointer group transition-colors"
                    >
                      <td className="px-3 py-2.5">
                        <div className="text-[13px] font-semibold text-[#0f0f0e]">
                          {String(row.symbol)}
                        </div>
                        <div className="text-[10px] text-[#aaa] truncate max-w-[140px]">
                          {String(row.company_name || "")}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[13px] font-medium text-[#0f0f0e] tabular-nums">
                        ₹{(row.close as number)?.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className="text-[13px] font-semibold"
                          style={{
                            color: (row.pct_change as number) >= 0 ? "#26a65b" : "#e5383b",
                          }}
                        >
                          {(row.pct_change as number) >= 0 ? "+" : ""}
                          {(row.pct_change as number)?.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[13px] font-semibold" style={{ color: "#7c6af0" }}>
                        {(row.volume_ratio as number)?.toFixed(1)}×
                      </td>
                      <td className="px-3 py-2.5">
                        {row.rsi_14 != null &&
                          (() => {
                            const { bg, color } = getRSIStyle(row.rsi_14 as number);
                            return (
                              <span
                                className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                                style={{ background: bg, color }}
                              >
                                {(row.rsi_14 as number).toFixed(0)}
                              </span>
                            );
                          })()}
                      </td>
                      <td className="px-3 py-2.5">
                        {row.ema_20 != null && (
                          <span
                            className="text-[11px] font-medium"
                            style={{
                              color:
                                (row.close as number) > (row.ema_20 as number)
                                  ? "#26a65b"
                                  : "#e5383b",
                            }}
                          >
                            {(row.close as number) > (row.ema_20 as number) ? "↑" : "↓"} EMA20
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-[#888]">
                        {row.week_52_high_pct != null
                          ? `${(row.week_52_high_pct as number).toFixed(1)}% away`
                          : "—"}
                      </td>
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleAddToWatchlist(row.symbol as string)}
                          disabled={addingToWl === row.symbol}
                          className="opacity-0 group-hover:opacity-100 text-[11px] font-medium px-3 py-1 rounded-full border border-[#e8e8e6] text-[#888] hover:border-[#5b63f5] hover:text-[#5b63f5] transition-all disabled:opacity-40"
                        >
                          {addingToWl === row.symbol ? "…" : "+ Watchlist"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#0f0f0e] text-white text-[13px] px-5 py-2.5 rounded-full shadow-lg z-50 pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  );
}
