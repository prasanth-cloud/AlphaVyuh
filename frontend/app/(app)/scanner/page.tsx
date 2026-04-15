"use client";

import { useState, useRef, useEffect } from "react";
import {
  Play, X, ChevronDown, BookmarkPlus, Trash2,
  BarChart2, Search, Check,
} from "lucide-react";
import type { ScanResult, ScanFilters, ScanResponse, SavedScreen } from "@/lib/api";
import { runScan, getScreens, saveScreen, deleteScreen } from "@/lib/api";
import StockDetailPanel from "@/components/scanner/StockDetailPanel";
import RsiBadge from "@/components/scanner/RsiBadge";
import PctChange from "@/components/scanner/PctChange";

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey = keyof ScanResult;

type ActiveCondition = {
  id: string;
  label: string;
  filterKey: keyof ScanFilters;
  filterKey2?: keyof ScanFilters;   // for range filters (min + max)
  type: "range" | "bool" | "preset";
  value?: number;
  value2?: number;
  boolValue?: boolean;
  unit?: string;
  display: string;                  // human-readable chip label
};

// ─── Filter definitions ───────────────────────────────────────────────────────

type FilterDef = {
  id: string;
  label: string;
  description: string;
  type: "range" | "bool" | "preset";
  filterKey: keyof ScanFilters;
  filterKey2?: keyof ScanFilters;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  // For "preset" type — pre-fills filter directly
  presetFilter?: Partial<ScanFilters>;
  presetLabel?: string;
};

type FilterCategory = {
  label: string;
  icon: string;
  filters: FilterDef[];
};

const FILTER_CATEGORIES: FilterCategory[] = [
  {
    label: "Price & Performance",
    icon: "₹",
    filters: [
      { id: "price", label: "Close Price", description: "Current closing price range", type: "range", filterKey: "price_min", filterKey2: "price_max", unit: "₹", min: 0, step: 1 },
      { id: "pct_change", label: "% Change", description: "Day's price change %", type: "range", filterKey: "pct_change_min", filterKey2: "pct_change_max", unit: "%", step: 0.1 },
      { id: "gap_pct", label: "Gap %", description: "Opening gap from prev close", type: "range", filterKey: "gap_pct_min", filterKey2: "gap_pct_max", unit: "%", step: 0.1 },
      { id: "high_min", label: "Day High ≥", description: "Day high at least this value", type: "range", filterKey: "high_min", unit: "₹", min: 0, step: 1 },
      { id: "gap_up", label: "Gap Up (>2%)", description: "Stocks that gapped up more than 2%", type: "preset", filterKey: "gap_pct_min", presetFilter: { gap_pct_min: 2 }, presetLabel: "Gap Up >2%" },
      { id: "gap_down", label: "Gap Down (<-2%)", description: "Stocks that gapped down more than 2%", type: "preset", filterKey: "gap_pct_max", presetFilter: { gap_pct_max: -2 }, presetLabel: "Gap Down <-2%" },
    ],
  },
  {
    label: "Volume",
    icon: "📊",
    filters: [
      { id: "vol_ratio", label: "Volume Ratio", description: "Volume vs 20-day average", type: "range", filterKey: "volume_ratio_min", filterKey2: "volume_ratio_max", unit: "×", min: 0, step: 0.1 },
      { id: "volume", label: "Abs. Volume", description: "Absolute shares traded", type: "range", filterKey: "volume_min", filterKey2: "volume_max", unit: "shares", min: 0, step: 1000 },
      { id: "turnover", label: "Turnover (₹L)", description: "Traded value in ₹ Lacs", type: "range", filterKey: "turnover_min", filterKey2: "turnover_max", unit: "L", min: 0, step: 10 },
      { id: "high_vol", label: "High Volume (>2×)", description: "Volume more than 2× average", type: "preset", filterKey: "volume_ratio_min", presetFilter: { volume_ratio_min: 2 }, presetLabel: "Vol > 2× avg" },
      { id: "very_high_vol", label: "Surge (>5×)", description: "Volume more than 5× average", type: "preset", filterKey: "volume_ratio_min", presetFilter: { volume_ratio_min: 5 }, presetLabel: "Vol > 5× avg" },
    ],
  },
  {
    label: "Momentum (RSI)",
    icon: "⚡",
    filters: [
      { id: "rsi", label: "RSI (14)", description: "RSI value range", type: "range", filterKey: "rsi_min", filterKey2: "rsi_max", unit: "", min: 0, max: 100, step: 1 },
      { id: "rsi_ob", label: "Overbought (RSI > 70)", description: "RSI above 70 — extended rally", type: "preset", filterKey: "rsi_min", presetFilter: { rsi_min: 70 }, presetLabel: "RSI > 70" },
      { id: "rsi_os", label: "Oversold (RSI < 30)", description: "RSI below 30 — potential bounce", type: "preset", filterKey: "rsi_max", presetFilter: { rsi_max: 30 }, presetLabel: "RSI < 30" },
      { id: "rsi_rising", label: "RSI Building (40–60)", description: "RSI in neutral-to-building zone", type: "preset", filterKey: "rsi_min", presetFilter: { rsi_min: 40, rsi_max: 60 }, presetLabel: "RSI 40–60" },
      { id: "rsi_momentum", label: "Momentum Zone (55–75)", description: "Strong but not extended momentum", type: "preset", filterKey: "rsi_min", presetFilter: { rsi_min: 55, rsi_max: 75 }, presetLabel: "RSI 55–75" },
    ],
  },
  {
    label: "Trend & Moving Averages",
    icon: "📈",
    filters: [
      { id: "above_ema20", label: "Price above EMA 20", description: "Close > EMA(20)", type: "bool", filterKey: "above_ema20" },
      { id: "below_ema20", label: "Price below EMA 20", description: "Close < EMA(20)", type: "bool", filterKey: "below_ema20" },
      { id: "above_ema50", label: "Price above EMA 50", description: "Close > EMA(50)", type: "bool", filterKey: "above_ema50" },
      { id: "below_ema50", label: "Price below EMA 50", description: "Close < EMA(50)", type: "bool", filterKey: "below_ema50" },
      { id: "above_ema200", label: "Price above EMA 200", description: "Long-term uptrend", type: "bool", filterKey: "above_ema200" },
      { id: "below_ema200", label: "Price below EMA 200", description: "Long-term downtrend", type: "bool", filterKey: "below_ema200" },
      { id: "ema20_gt_ema50", label: "EMA 20 > EMA 50 (Bullish)", description: "Short-term MA above mid-term", type: "bool", filterKey: "ema20_above_ema50" },
      { id: "ema50_gt_ema200", label: "EMA 50 > EMA 200 (Golden Cross zone)", description: "Mid-term MA above long-term", type: "bool", filterKey: "ema50_above_ema200" },
      { id: "all_bull", label: "All EMAs Aligned Bullish", description: "EMA20 > EMA50 > EMA200 — full uptrend", type: "bool", filterKey: "all_emas_bullish" },
      { id: "all_bear", label: "All EMAs Aligned Bearish", description: "EMA20 < EMA50 < EMA200 — full downtrend", type: "bool", filterKey: "all_emas_bearish" },
      { id: "ema20_dist", label: "Distance from EMA 20 (%)", description: "% gap between close and EMA20", type: "range", filterKey: "ema20_dist_min", filterKey2: "ema20_dist_max", unit: "%", step: 0.5 },
      { id: "ema50_dist", label: "Distance from EMA 50 (%)", description: "% gap between close and EMA50", type: "range", filterKey: "ema50_dist_min", filterKey2: "ema50_dist_max", unit: "%", step: 0.5 },
    ],
  },
  {
    label: "Volatility (ATR)",
    icon: "🌊",
    filters: [
      { id: "atr", label: "ATR (14)", description: "Average True Range value", type: "range", filterKey: "atr_min", filterKey2: "atr_max", unit: "₹", min: 0, step: 0.5 },
      { id: "atr_pct", label: "ATR % of Price", description: "ATR as % of closing price", type: "range", filterKey: "atr_pct_min", filterKey2: "atr_pct_max", unit: "%", min: 0, step: 0.1 },
      { id: "high_atr", label: "High Volatility (ATR% > 3%)", description: "Wide-ranging stock", type: "preset", filterKey: "atr_pct_min", presetFilter: { atr_pct_min: 3 }, presetLabel: "ATR% > 3" },
      { id: "low_atr", label: "Low Volatility (ATR% < 1%)", description: "Consolidating stock", type: "preset", filterKey: "atr_pct_max", presetFilter: { atr_pct_max: 1 }, presetLabel: "ATR% < 1" },
    ],
  },
  {
    label: "52-Week Range",
    icon: "📅",
    filters: [
      { id: "w52h_pct", label: "% from 52W High (max)", description: "Within X% of 52-week high", type: "range", filterKey: "w52h_pct_max", unit: "%", min: 0, step: 1 },
      { id: "w52l_pct", label: "% above 52W Low (min)", description: "At least X% above 52-week low", type: "range", filterKey: "w52l_pct_min", unit: "%", min: 0, step: 5 },
      { id: "new_52w_high", label: "New 52W High", description: "Price at or above 52-week high", type: "bool", filterKey: "new_52w_high" },
      { id: "new_52w_low", label: "New 52W Low", description: "Price at or below 52-week low", type: "bool", filterKey: "new_52w_low" },
      { id: "near_52h", label: "Near 52W High (within 5%)", description: "Strong stock near yearly high", type: "preset", filterKey: "w52h_pct_max", presetFilter: { w52h_pct_max: 5 }, presetLabel: "Within 5% of 52W High" },
      { id: "near_52l", label: "Near 52W Low (within 10%)", description: "Potential reversal watch", type: "preset", filterKey: "w52l_pct_min", presetFilter: { w52l_pct_min: 10 }, presetLabel: "Within 10% of 52W Low" },
    ],
  },
];

// ─── Preset screens ───────────────────────────────────────────────────────────

const PRESETS: { label: string; desc: string; filters: ScanFilters }[] = [
  {
    label: "Momentum",
    desc: "Strong RSI + volume surge",
    filters: { rsi_min: 55, rsi_max: 75, volume_ratio_min: 1.5, above_ema20: true },
  },
  {
    label: "Breakout",
    desc: "Price surge with heavy volume",
    filters: { pct_change_min: 2, volume_ratio_min: 2, above_ema50: true },
  },
  {
    label: "Oversold Bounce",
    desc: "Deeply oversold — watch for reversal",
    filters: { rsi_min: 20, rsi_max: 35 },
  },
  {
    label: "EMA Aligned",
    desc: "All EMAs bullish (20>50>200)",
    filters: { all_emas_bullish: true, above_ema200: true },
  },
  {
    label: "Near 52W High",
    desc: "Within 5% of 52-week high",
    filters: { w52h_pct_max: 5, above_ema50: true },
  },
  {
    label: "Volume Surge",
    desc: "Unusual volume activity (>3×)",
    filters: { volume_ratio_min: 3 },
  },
  {
    label: "Gap Up + Volume",
    desc: "Gapped up with strong volume",
    filters: { gap_pct_min: 1.5, volume_ratio_min: 1.5 },
  },
  {
    label: "Golden Cross Zone",
    desc: "EMA50 above EMA200",
    filters: { ema50_above_ema200: true, above_ema50: true },
  },
];

// ─── Table columns ────────────────────────────────────────────────────────────

type ColDef = {
  key: string;
  label: string;
  sortKey?: SortKey;
  render: (r: ScanResult) => React.ReactNode;
  align?: "right";
  width?: string;
};

function priceFmt(v: number | null | undefined) {
  if (v == null) return <span className="text-[#ccc]">—</span>;
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function volFmt(v: number) {
  if (v >= 10_000_000) return `${(v / 10_000_000).toFixed(1)}Cr`;
  if (v >= 100_000)    return `${(v / 100_000).toFixed(1)}L`;
  return v.toLocaleString("en-IN");
}
function numFmt(v: number | null | undefined, dec = 2, suffix = "") {
  if (v == null) return <span className="text-[#ccc]">—</span>;
  return `${v.toFixed(dec)}${suffix}`;
}
function emaDir(close: number, ema: number | null) {
  if (ema == null) return <span className="text-[#ddd]">—</span>;
  return close > ema
    ? <span className="text-[11px] font-bold text-[#26a65b]">↑</span>
    : <span className="text-[11px] font-bold text-[#e5383b]">↓</span>;
}

const TABLE_COLS: ColDef[] = [
  {
    key: "symbol",
    label: "Symbol",
    sortKey: "symbol",
    width: "w-[160px]",
    render: r => (
      <div className="flex items-center gap-2 min-w-0">
        <a href={`/charts/${r.symbol}`} onClick={e => e.stopPropagation()}
          className="text-[#5b63f5] hover:underline shrink-0">
          <BarChart2 size={12} />
        </a>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-[#1c1c1a] leading-none">{r.symbol}</div>
          <div className="text-[10px] text-[#aaa] truncate max-w-[120px] mt-0.5">{r.company_name}</div>
        </div>
      </div>
    ),
  },
  {
    key: "close", label: "Close", sortKey: "close", align: "right",
    render: r => <span className="tabular-nums text-[12px] font-medium text-[#1c1c1a]">{priceFmt(r.close)}</span>,
  },
  {
    key: "pct_change", label: "Chg %", sortKey: "pct_change", align: "right",
    render: r => <PctChange pct={r.pct_change} />,
  },
  {
    key: "gap_pct", label: "Gap %", sortKey: "gap_pct" as SortKey, align: "right",
    render: r => r.gap_pct != null
      ? <span className={`text-[11px] font-medium tabular-nums ${r.gap_pct >= 0 ? "text-[#26a65b]" : "text-[#e5383b]"}`}>
          {r.gap_pct >= 0 ? "+" : ""}{r.gap_pct.toFixed(2)}%
        </span>
      : <span className="text-[#ccc]">—</span>,
  },
  {
    key: "volume", label: "Volume", sortKey: "volume", align: "right",
    render: r => <span className="tabular-nums text-[12px] text-[#444]">{volFmt(r.volume)}</span>,
  },
  {
    key: "volume_ratio", label: "Vol Ratio", sortKey: "volume_ratio", align: "right",
    render: r => r.volume_ratio != null
      ? <span className="tabular-nums text-[12px] font-semibold" style={{ color: r.volume_ratio >= 2 ? "#7c6af0" : r.volume_ratio >= 1.5 ? "#5b63f5" : "#888" }}>
          {r.volume_ratio.toFixed(2)}×
        </span>
      : <span className="text-[#ccc]">—</span>,
  },
  {
    key: "rsi_14", label: "RSI 14", sortKey: "rsi_14", align: "right",
    render: r => <RsiBadge rsi={r.rsi_14} />,
  },
  {
    key: "ema_trend", label: "EMA", align: "right", width: "w-[72px]",
    render: r => (
      <div className="flex items-center gap-0.5 justify-end">
        <span className="text-[9px] text-[#ccc]">20</span>{emaDir(r.close, r.ema_20)}
        <span className="text-[9px] text-[#ccc] ml-0.5">50</span>{emaDir(r.close, r.ema_50)}
        <span className="text-[9px] text-[#ccc] ml-0.5">200</span>{emaDir(r.close, r.ema_200)}
      </div>
    ),
  },
  {
    key: "week_52_high_pct", label: "52W H%", sortKey: "week_52_high_pct", align: "right",
    render: r => r.week_52_high_pct != null
      ? <span className={`text-[11px] tabular-nums font-medium ${r.week_52_high_pct <= 5 ? "text-[#26a65b]" : "text-[#888]"}`}>
          {r.week_52_high_pct.toFixed(1)}%
        </span>
      : <span className="text-[#ccc]">—</span>,
  },
  {
    key: "atr_pct", label: "ATR%", sortKey: "atr_pct" as SortKey, align: "right",
    render: r => <span className="tabular-nums text-[11px] text-[#888]">{numFmt(r.atr_pct, 1, "%")}</span>,
  },
  {
    key: "turnover", label: "Turnover", sortKey: "turnover" as SortKey, align: "right",
    render: r => r.turnover != null
      ? <span className="tabular-nums text-[11px] text-[#888]">₹{r.turnover.toFixed(0)}L</span>
      : <span className="text-[#ccc]">—</span>,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2);
}

function conditionFromDef(def: FilterDef, v1?: number, v2?: number): ActiveCondition {
  if (def.type === "preset") {
    return {
      id: uid(),
      label: def.presetLabel || def.label,
      filterKey: def.filterKey,
      type: "preset",
      display: def.presetLabel || def.label,
    };
  }
  if (def.type === "bool") {
    return {
      id: uid(),
      label: def.label,
      filterKey: def.filterKey,
      type: "bool",
      boolValue: true,
      display: def.label,
    };
  }
  // range
  const parts = [];
  if (v1 != null) parts.push(`≥ ${v1}${def.unit || ""}`);
  if (v2 != null) parts.push(`≤ ${v2}${def.unit || ""}`);
  return {
    id: uid(),
    label: def.label,
    filterKey: def.filterKey,
    filterKey2: def.filterKey2,
    type: "range",
    value: v1,
    value2: v2,
    unit: def.unit,
    display: parts.length ? `${def.label}: ${parts.join(", ")}` : def.label,
  };
}

function conditionsToFilters(conditions: ActiveCondition[], presets: Partial<ScanFilters>): ScanFilters {
  const f: ScanFilters = { ...presets };
  for (const c of conditions) {
    if (c.type === "bool") {
      (f as Record<string, unknown>)[c.filterKey as string] = true;
    } else if (c.type === "range") {
      if (c.value   != null && c.filterKey)  (f as Record<string, unknown>)[c.filterKey  as string] = c.value;
      if (c.value2  != null && c.filterKey2) (f as Record<string, unknown>)[c.filterKey2 as string] = c.value2;
    }
    // preset type: already applied via presets map
  }
  return f;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FilterPanelCategoryItem({
  def,
  onAdd,
}: {
  def: FilterDef;
  onAdd: (def: FilterDef, v1?: number, v2?: number) => void;
}) {
  const [v1, setV1] = useState<string>("");
  const [v2, setV2] = useState<string>("");

  if (def.type === "preset" || def.type === "bool") {
    return (
      <button
        onClick={() => onAdd(def)}
        className="w-full flex items-start justify-between gap-2 px-3 py-2.5 rounded-[6px] hover:bg-[#f7f7f5] text-left group transition-colors"
      >
        <div>
          <div className="text-[12px] font-medium text-[#1c1c1a]">{def.label}</div>
          <div className="text-[10px] text-[#aaa] mt-0.5">{def.description}</div>
        </div>
        <span className="text-[10px] text-[#5b63f5] opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">+ Add</span>
      </button>
    );
  }

  return (
    <div className="px-3 py-2.5 rounded-[6px] hover:bg-[#f7f7f5] group transition-colors">
      <div className="flex items-center justify-between mb-1.5">
        <div>
          <div className="text-[12px] font-medium text-[#1c1c1a]">{def.label}</div>
          <div className="text-[10px] text-[#aaa]">{def.description}</div>
        </div>
        <button
          onClick={() => onAdd(def, v1 ? Number(v1) : undefined, v2 ? Number(v2) : undefined)}
          className="text-[10px] text-[#5b63f5] font-medium px-2 py-0.5 rounded-[4px] border border-[#5b63f544] bg-[#eeeffe] hover:bg-[#5b63f5] hover:text-white transition-colors shrink-0"
        >
          + Add
        </button>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number" placeholder={`Min${def.unit ? ` (${def.unit})` : ""}`}
          value={v1} min={def.min} max={def.max} step={def.step}
          onChange={e => setV1(e.target.value)}
          className="flex-1 text-[11px] border border-[#e2e2df] rounded-[4px] px-2 py-1 outline-none focus:border-[#5b63f5] tabular-nums"
        />
        {def.filterKey2 && (
          <>
            <span className="text-[10px] text-[#ccc]">—</span>
            <input
              type="number" placeholder={`Max${def.unit ? ` (${def.unit})` : ""}`}
              value={v2} min={def.min} max={def.max} step={def.step}
              onChange={e => setV2(e.target.value)}
              className="flex-1 text-[11px] border border-[#e2e2df] rounded-[4px] px-2 py-1 outline-none focus:border-[#5b63f5] tabular-nums"
            />
          </>
        )}
      </div>
    </div>
  );
}

function FilterPanel({
  onAdd,
  onClose,
}: {
  onAdd: (def: FilterDef, v1?: number, v2?: number) => void;
  onClose: () => void;
}) {
  const [activeCat, setActiveCat] = useState(0);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filteredCats = search
    ? FILTER_CATEGORIES.map(cat => ({
        ...cat,
        filters: cat.filters.filter(f =>
          f.label.toLowerCase().includes(search.toLowerCase()) ||
          f.description.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter(cat => cat.filters.length > 0)
    : FILTER_CATEGORIES;

  return (
    <div className="absolute top-full left-0 mt-1 z-50 w-[620px] bg-white border border-[#e2e2df] rounded-[10px] shadow-xl overflow-hidden flex flex-col" style={{ maxHeight: "520px" }}>
      {/* Search */}
      <div className="px-3 py-2.5 border-b border-[#f0f0ee] flex items-center gap-2">
        <Search size={13} className="text-[#aaa] shrink-0" />
        <input
          ref={inputRef}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search filters…"
          className="flex-1 text-[13px] outline-none text-[#1c1c1a] placeholder:text-[#ccc]"
        />
        <button onClick={onClose} className="text-[#aaa] hover:text-[#666]"><X size={13} /></button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Category list */}
        {!search && (
          <div className="w-[180px] border-r border-[#f0f0ee] py-2 shrink-0 overflow-y-auto">
            {FILTER_CATEGORIES.map((cat, i) => (
              <button
                key={cat.label}
                onClick={() => setActiveCat(i)}
                className={`w-full text-left px-4 py-2.5 text-[12px] transition-colors ${activeCat === i ? "bg-[#eeeffe] text-[#5b63f5] font-semibold" : "text-[#444] hover:bg-[#f7f7f5]"}`}
              >
                <span className="mr-2 text-[13px]">{cat.icon}</span>{cat.label}
              </button>
            ))}
          </div>
        )}

        {/* Filter list */}
        <div className="flex-1 overflow-y-auto py-2 px-2">
          {(search ? filteredCats : [FILTER_CATEGORIES[activeCat]]).map(cat => (
            <div key={cat.label}>
              {search && <div className="px-3 py-1.5 text-[10px] uppercase tracking-[0.5px] text-[#aaa] font-semibold">{cat.label}</div>}
              <div className="space-y-0.5">
                {cat.filters.map(def => (
                  <FilterPanelCategoryItem key={def.id} def={def} onAdd={onAdd} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 14 }).map((_, i) => (
        <tr key={i} className="border-b border-[#f7f7f5]">
          {TABLE_COLS.map(col => (
            <td key={col.key} className="px-3 py-3">
              <div className="h-3 bg-[#f0f0ee] rounded animate-pulse" style={{ width: col.key === "symbol" ? "120px" : "60px" }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ScannerPage() {
  const [conditions, setConditions]       = useState<ActiveCondition[]>([]);
  const [presetFilters, setPresetFilters] = useState<Partial<ScanFilters>>({});
  const [seriesFilter, setSeriesFilter]   = useState<string[]>(["EQ", "BE"]);
  const [sortKey, setSortKey]             = useState<string>("volume_ratio");
  const [sortOrder, setSortOrder]         = useState<"asc" | "desc">("desc");

  const [results, setResults]   = useState<ScanResult[] | null>(null);
  const [scanMeta, setScanMeta] = useState<{ trade_date: string; total_matches: number; plan_limit: number } | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const [selectedStock, setSelectedStock] = useState<ScanResult | null>(null);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showPresets, setShowPresets]     = useState(false);
  const [showSortMenu, setShowSortMenu]   = useState(false);
  const filterBtnRef = useRef<HTMLDivElement>(null);

  // Saved screens
  const [screens, setScreens]           = useState<SavedScreen[]>([]);
  const [saveName, setSaveName]         = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const screensLoadedRef = useRef(false);

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (filterBtnRef.current && !filterBtnRef.current.contains(e.target as Node)) {
        setShowFilterPanel(false);
        setShowPresets(false);
        setShowSortMenu(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function loadScreens() {
    if (screensLoadedRef.current) return;
    const s = await getScreens();
    setScreens(s);
    screensLoadedRef.current = true;
  }

  function addCondition(def: FilterDef, v1?: number, v2?: number) {
    if (def.type === "preset") {
      setPresetFilters(prev => ({ ...prev, ...def.presetFilter }));
      setConditions(prev => {
        // avoid duplicate presets
        const exists = prev.find(c => c.filterKey === def.filterKey && c.type === "preset");
        if (exists) return prev.map(c => c.filterKey === def.filterKey && c.type === "preset"
          ? { ...c, display: def.presetLabel || def.label }
          : c
        );
        return [...prev, conditionFromDef(def, v1, v2)];
      });
    } else {
      setConditions(prev => [...prev, conditionFromDef(def, v1, v2)]);
    }
    setShowFilterPanel(false);
  }

  function removeCondition(id: string) {
    const cond = conditions.find(c => c.id === id);
    setConditions(prev => prev.filter(c => c.id !== id));
    if (cond?.type === "preset") {
      // Remove the preset filter keys
      const def = FILTER_CATEGORIES.flatMap(c => c.filters).find(f => f.filterKey === cond.filterKey && f.type === "preset");
      if (def?.presetFilter) {
        setPresetFilters(prev => {
          const next = { ...prev };
          Object.keys(def.presetFilter!).forEach(k => delete (next as Record<string, unknown>)[k]);
          return next;
        });
      }
    }
  }

  function applyPreset(preset: typeof PRESETS[0]) {
    setConditions([]);
    setPresetFilters({});
    // Convert preset filters to conditions
    const cats = FILTER_CATEGORIES.flatMap(c => c.filters);
    const newConditions: ActiveCondition[] = [];
    for (const [key, val] of Object.entries(preset.filters)) {
      if (val == null) continue;
      const def = cats.find(f => f.filterKey === key || f.filterKey2 === key);
      if (!def) continue;
      if (def.type === "bool") {
        newConditions.push(conditionFromDef(def));
      }
    }
    // Remaining range keys
    const rangeFilters = { ...preset.filters };
    for (const c of newConditions) {
      delete (rangeFilters as Record<string, unknown>)[c.filterKey as string];
    }
    setPresetFilters(rangeFilters);
    setConditions(newConditions);
    setShowPresets(false);
  }

  function clearAll() {
    setConditions([]);
    setPresetFilters({});
    setResults(null);
    setScanMeta(null);
    setError("");
  }

  async function handleRun() {
    setLoading(true);
    setError("");
    setSelectedStock(null);
    const filters = conditionsToFilters(conditions, {
      ...presetFilters,
      series: seriesFilter,
    });
    try {
      const resp: ScanResponse = await runScan(filters, sortKey, sortOrder);
      setResults(resp.results);
      setScanMeta({ trade_date: resp.trade_date, total_matches: resp.total_matches, plan_limit: resp.plan_limit });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveScreen() {
    if (!saveName.trim() || !scanMeta) return;
    const filters = conditionsToFilters(conditions, { ...presetFilters, series: seriesFilter });
    try {
      const s = await saveScreen(saveName.trim(), filters as Record<string, unknown>);
      setScreens(prev => [...prev, s]);
      setSaveName("");
      setShowSaveInput(false);
    } catch { /* ignore */ }
  }

  const isCapped = scanMeta && results && scanMeta.total_matches > results.length;
  const totalConditions = conditions.length + Object.keys(presetFilters).length;

  const SORT_OPTIONS = [
    { key: "volume_ratio", label: "Volume Ratio" },
    { key: "pct_change",   label: "% Change" },
    { key: "close",        label: "Price" },
    { key: "rsi_14",       label: "RSI 14" },
    { key: "week_52_high_pct", label: "52W High %" },
    { key: "atr_pct",     label: "ATR %" },
    { key: "turnover",    label: "Turnover" },
    { key: "gap_pct",     label: "Gap %" },
    { key: "symbol",      label: "Symbol A-Z" },
  ];

  return (
    <div className="flex flex-col h-screen bg-[#f2f2f0] overflow-hidden">

      {/* ── Top toolbar ─────────────────────────────────────────────── */}
      <div className="bg-white border-b border-[#e2e2df] px-4 py-2.5 flex-shrink-0" ref={filterBtnRef}>
        <div className="flex items-center gap-3 flex-wrap">

          {/* Title */}
          <span className="text-[14px] font-bold text-[#1c1c1a] tracking-tight shrink-0">Scanner</span>
          <div className="w-px h-5 bg-[#e2e2df] shrink-0" />

          {/* Presets */}
          <div className="relative shrink-0">
            <button
              onClick={() => { setShowPresets(o => !o); setShowFilterPanel(false); setShowSortMenu(false); loadScreens(); }}
              className="flex items-center gap-1.5 text-[12px] font-medium text-[#444] border border-[#e2e2df] rounded-[6px] px-3 py-1.5 hover:border-[#5b63f5] hover:text-[#5b63f5] transition-colors"
            >
              Presets <ChevronDown size={12} />
            </button>
            {showPresets && (
              <div className="absolute top-full mt-1 left-0 z-50 w-[340px] bg-white border border-[#e2e2df] rounded-[10px] shadow-xl overflow-hidden">
                <div className="p-3 border-b border-[#f0f0ee]">
                  <div className="text-[11px] font-semibold text-[#888] uppercase tracking-[0.5px] mb-2">Built-in Screens</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PRESETS.map(p => (
                      <button key={p.label} onClick={() => applyPreset(p)}
                        className="text-left px-2.5 py-2 rounded-[6px] border border-[#e2e2df] hover:border-[#5b63f5] hover:bg-[#eeeffe] transition-colors">
                        <div className="text-[12px] font-medium text-[#1c1c1a]">{p.label}</div>
                        <div className="text-[10px] text-[#aaa]">{p.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
                {/* Saved screens */}
                {screens.length > 0 && (
                  <div className="p-3">
                    <div className="text-[11px] font-semibold text-[#888] uppercase tracking-[0.5px] mb-2">Saved Screens</div>
                    <div className="space-y-1">
                      {screens.map(s => (
                        <div key={s.id} className="flex items-center justify-between group">
                          <button
                            onClick={() => {
                              setPresetFilters(s.filters as ScanFilters);
                              setConditions([]);
                              setShowPresets(false);
                            }}
                            className="text-[12px] text-[#444] hover:text-[#5b63f5] text-left"
                          >
                            {s.name}
                          </button>
                          <button
                            onClick={() => { deleteScreen(s.id); setScreens(prev => prev.filter(x => x.id !== s.id)); }}
                            className="opacity-0 group-hover:opacity-100 text-[#aaa] hover:text-[#e5383b]"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Series filter pills */}
          <div className="flex items-center gap-1 shrink-0">
            {["EQ", "BE", "BZ"].map(s => {
              const on = seriesFilter.includes(s);
              return (
                <button key={s}
                  onClick={() => setSeriesFilter(prev => on ? prev.filter(x => x !== s) : [...prev, s])}
                  className="text-[11px] px-2 py-1 rounded-[4px] font-medium transition-colors"
                  style={on
                    ? { background: "#1c1c1a", color: "#fff" }
                    : { background: "#f7f7f5", color: "#aaa", border: "1px solid #e2e2df" }
                  }
                >
                  {s}
                </button>
              );
            })}
          </div>

          <div className="w-px h-5 bg-[#e2e2df] shrink-0" />

          {/* Add filter */}
          <div className="relative shrink-0">
            <button
              onClick={() => { setShowFilterPanel(o => !o); setShowPresets(false); setShowSortMenu(false); }}
              className="flex items-center gap-1.5 text-[12px] font-medium bg-[#5b63f5] text-white border border-[#5b63f5] rounded-[6px] px-3 py-1.5 hover:bg-[#4a53e0] transition-colors"
            >
              + Add Filter
              {totalConditions > 0 && (
                <span className="bg-white text-[#5b63f5] text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                  {totalConditions}
                </span>
              )}
            </button>
            {showFilterPanel && (
              <FilterPanel
                onAdd={addCondition}
                onClose={() => setShowFilterPanel(false)}
              />
            )}
          </div>

          {/* Active condition chips */}
          <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
            {/* Preset filter chips */}
            {Object.entries(presetFilters).map(([k, v]) => {
              if (v == null) return null;
              const allDefs = FILTER_CATEGORIES.flatMap(c => c.filters);
              const def = allDefs.find(d => d.filterKey === k || d.filterKey2 === k);
              const label = def ? `${def.label}: ${v}${def.unit || ""}` : `${k}: ${v}`;
              return (
                <span key={k} className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#eeeffe] text-[#5b63f5] border border-[#5b63f544]">
                  {label}
                  <button onClick={() => setPresetFilters(prev => { const n = { ...prev }; delete (n as Record<string, unknown>)[k]; return n; })} className="hover:opacity-70">
                    <X size={9} />
                  </button>
                </span>
              );
            })}
            {conditions.map(c => (
              <span key={c.id} className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#eeeffe] text-[#5b63f5] border border-[#5b63f544] whitespace-nowrap">
                {c.display}
                <button onClick={() => removeCondition(c.id)} className="hover:opacity-70"><X size={9} /></button>
              </span>
            ))}
            {totalConditions > 0 && (
              <button onClick={clearAll} className="text-[11px] text-[#aaa] hover:text-[#e5383b] transition-colors whitespace-nowrap">
                Clear all
              </button>
            )}
          </div>

          {/* Right side: sort + meta + save + run */}
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            {scanMeta && (
              <span className="text-[11px] text-[#aaa] whitespace-nowrap">
                {scanMeta.total_matches.toLocaleString()} results · {scanMeta.trade_date}
              </span>
            )}

            {/* Sort */}
            <div className="relative">
              <button
                onClick={() => { setShowSortMenu(o => !o); setShowFilterPanel(false); setShowPresets(false); }}
                className="flex items-center gap-1 text-[11px] text-[#666] border border-[#e2e2df] rounded-[6px] px-2.5 py-1.5 hover:border-[#888] transition-colors"
              >
                Sort: {SORT_OPTIONS.find(s => s.key === sortKey)?.label}
                <span className="text-[10px] ml-0.5">{sortOrder === "desc" ? "↓" : "↑"}</span>
                <ChevronDown size={11} />
              </button>
              {showSortMenu && (
                <div className="absolute right-0 top-full mt-1 z-50 w-[180px] bg-white border border-[#e2e2df] rounded-[8px] shadow-lg overflow-hidden py-1">
                  {SORT_OPTIONS.map(opt => (
                    <button key={opt.key}
                      onClick={() => {
                        if (sortKey === opt.key) setSortOrder(o => o === "desc" ? "asc" : "desc");
                        else { setSortKey(opt.key); setSortOrder("desc"); }
                        setShowSortMenu(false);
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 text-[12px] text-[#444] hover:bg-[#f7f7f5]"
                    >
                      {opt.label}
                      {sortKey === opt.key && <Check size={11} className="text-[#5b63f5]" />}
                    </button>
                  ))}
                  <div className="border-t border-[#f0f0ee] mt-1 pt-1 px-3 py-1.5 flex gap-2">
                    {["desc", "asc"].map(o => (
                      <button key={o}
                        onClick={() => { setSortOrder(o as "asc" | "desc"); setShowSortMenu(false); }}
                        className={`text-[11px] px-2 py-0.5 rounded-[4px] ${sortOrder === o ? "bg-[#1c1c1a] text-white" : "text-[#666] hover:bg-[#f7f7f5]"}`}
                      >
                        {o === "desc" ? "High → Low" : "Low → High"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Save screen */}
            {results && (
              showSaveInput ? (
                <div className="flex items-center gap-1.5">
                  <input
                    autoFocus value={saveName}
                    onChange={e => setSaveName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSaveScreen()}
                    placeholder="Screen name…"
                    className="text-[11px] border border-[#e2e2df] rounded-[5px] px-2 py-1 w-[140px] outline-none focus:border-[#5b63f5]"
                  />
                  <button onClick={handleSaveScreen} className="text-[11px] text-[#5b63f5] font-medium">Save</button>
                  <button onClick={() => setShowSaveInput(false)} className="text-[#aaa]"><X size={11} /></button>
                </div>
              ) : (
                <button onClick={() => setShowSaveInput(true)}
                  className="flex items-center gap-1 text-[11px] text-[#666] border border-[#e2e2df] rounded-[6px] px-2.5 py-1.5 hover:border-[#888] transition-colors">
                  <BookmarkPlus size={11} /> Save
                </button>
              )
            )}

            {/* Run button */}
            <button
              onClick={handleRun}
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-[6px] bg-[#1c1c1a] text-white text-[12px] font-semibold hover:opacity-85 disabled:opacity-60 transition-opacity"
            >
              <Play size={12} />
              {loading ? "Scanning…" : "Run Scan"}
            </button>
          </div>
        </div>

        {/* Cap banner */}
        {isCapped && (
          <div className="mt-2 flex items-center justify-between text-[11px] bg-[#fff8ec] border border-[#f0e4c0] rounded-[6px] px-3 py-1.5">
            <span className="text-[#92600a]">Showing {results!.length} of {scanMeta!.total_matches} matches. Upgrade to Pro for full results.</span>
            <a href="/settings/billing" className="text-[#d97706] font-semibold hover:underline ml-4">Upgrade →</a>
          </div>
        )}
        {error && (
          <div className="mt-2 text-[12px] text-[#e5383b] bg-[#fff0f0] border border-[#fcd5d5] rounded-[6px] px-3 py-1.5">
            {error}
          </div>
        )}
      </div>

      {/* ── Main area ────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Results table */}
        <div className="flex-1 overflow-auto bg-white min-w-0">
          {!results && !loading ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="w-12 h-12 rounded-full bg-[#eeeffe] flex items-center justify-center mb-3">
                <Play size={20} className="text-[#5b63f5]" />
              </div>
              <div className="text-[15px] font-semibold text-[#1c1c1a] mb-1">Set filters and run a scan</div>
              <div className="text-[12px] text-[#aaa] max-w-[340px]">
                Use the preset screens or build custom conditions with &quot;+ Add Filter&quot;. Results show NSE stocks from the latest trading day.
              </div>
              <div className="flex flex-wrap gap-2 mt-5 justify-center max-w-[400px]">
                {PRESETS.map(p => (
                  <button key={p.label} onClick={() => applyPreset(p)}
                    className="text-[11px] px-3 py-1.5 rounded-full border border-[#e2e2df] text-[#555] hover:border-[#5b63f5] hover:text-[#5b63f5] transition-colors bg-white">
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <table className="w-full border-collapse text-[12px]" style={{ minWidth: "900px" }}>
              <thead className="sticky top-0 bg-white border-b border-[#e2e2df] z-10">
                <tr>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.4px] text-[#888] w-8">#</th>
                  {TABLE_COLS.map(col => (
                    <th
                      key={col.key}
                      onClick={col.sortKey ? () => {
                        if (sortKey === col.sortKey) setSortOrder(o => o === "desc" ? "asc" : "desc");
                        else { setSortKey(col.sortKey!); setSortOrder("desc"); }
                      } : undefined}
                      className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.4px] text-[#888] whitespace-nowrap ${col.align === "right" ? "text-right" : "text-left"} ${col.sortKey ? "cursor-pointer hover:text-[#1c1c1a] select-none" : ""} ${col.width || ""}`}
                    >
                      {col.label}
                      {col.sortKey && sortKey === col.sortKey && (
                        <span className="ml-0.5">{sortOrder === "desc" ? " ↓" : " ↑"}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? <SkeletonRows />
                  : results?.map((stock, i) => (
                      <tr
                        key={stock.symbol}
                        onClick={() => setSelectedStock(stock)}
                        className={`border-b border-[#f7f7f5] cursor-pointer transition-colors ${
                          selectedStock?.symbol === stock.symbol ? "bg-[#eeeffe]" : "hover:bg-[#f7f7f5]"
                        }`}
                      >
                        <td className="px-3 py-2.5 text-[10px] text-[#ccc] tabular-nums">{i + 1}</td>
                        {TABLE_COLS.map(col => (
                          <td key={col.key} className={`px-3 py-2.5 ${col.align === "right" ? "text-right" : ""}`}>
                            {col.render(stock)}
                          </td>
                        ))}
                      </tr>
                    ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail panel */}
        {selectedStock && (
          <StockDetailPanel stock={selectedStock} onClose={() => setSelectedStock(null)} />
        )}
      </div>
    </div>
  );
}
