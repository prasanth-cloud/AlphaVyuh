"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getScannerPresets, runScanner,
  type ScanPreset, type ScanResult,
} from "@/lib/api";

type Filters = Record<string, unknown>;

function pctColor(v: number | null) {
  if (v == null) return "#aaa";
  return v >= 0 ? "#26a65b" : "#e5383b";
}

function rsiClass(v: number | null) {
  if (v == null) return "";
  if (v > 70) return "rsi-high";
  if (v < 40) return "rsi-low";
  return "rsi-mid";
}

function Section({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  const [expanded, setExpanded] = useState(open);
  return (
    <div className="border-b border-[#f0f0ee]">
      <button onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left">
        <span className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[#888]">{title}</span>
        <span className="text-[#bbb] text-[10px]">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && <div className="px-4 pb-3 space-y-2">{children}</div>}
    </div>
  );
}

function RangeRow({ label, keyMin, keyMax, filters, onChange }: {
  label: string; keyMin: string; keyMax: string; filters: Filters; onChange: (k: string, v: unknown) => void;
}) {
  return (
    <div>
      <div className="text-[11px] text-[#888] mb-1">{label}</div>
      <div className="flex gap-1.5">
        {keyMin && (
          <input type="number" placeholder="Min"
            value={(filters[keyMin] as number) ?? ""}
            onChange={e => onChange(keyMin, e.target.value === "" ? null : parseFloat(e.target.value))}
            className="w-full text-[12px] border border-[#e2e2df] rounded-[6px] px-2 py-1 outline-none focus:border-[#5b63f5]" />
        )}
        {keyMax && (
          <input type="number" placeholder="Max"
            value={(filters[keyMax] as number) ?? ""}
            onChange={e => onChange(keyMax, e.target.value === "" ? null : parseFloat(e.target.value))}
            className="w-full text-[12px] border border-[#e2e2df] rounded-[6px] px-2 py-1 outline-none focus:border-[#5b63f5]" />
        )}
      </div>
    </div>
  );
}

function SelectRow({ label, filterKey, options, filters, onChange }: {
  label: string; filterKey: string; options: { value: string; label: string }[];
  filters: Filters; onChange: (k: string, v: unknown) => void;
}) {
  return (
    <div>
      <div className="text-[11px] text-[#888] mb-1">{label}</div>
      <select value={(filters[filterKey] as string) ?? ""}
        onChange={e => onChange(filterKey, e.target.value === "" ? null : e.target.value)}
        className="w-full text-[12px] border border-[#e2e2df] rounded-[6px] px-2 py-1.5 outline-none focus:border-[#5b63f5] bg-white">
        <option value="">Any</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function ToggleRow({ label, filterKey, filters, onChange }: {
  label: string; filterKey: string; filters: Filters; onChange: (k: string, v: unknown) => void;
}) {
  const on = filters[filterKey] === true;
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div onClick={() => onChange(filterKey, on ? null : true)}
        className={`w-8 h-4 rounded-full transition-colors flex-shrink-0 cursor-pointer ${on ? "bg-[#5b63f5]" : "bg-[#e2e2df]"}`}>
        <div className={`w-3.5 h-3.5 rounded-full bg-white shadow-sm mt-0.5 transition-all ${on ? "ml-[18px]" : "ml-0.5"}`} />
      </div>
      <span className="text-[12px] text-[#555]">{label}</span>
    </label>
  );
}

export default function ScannerPage() {
  const router = useRouter();
  const [presets, setPresets]           = useState<ScanPreset[]>([]);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [filters, setFilters]           = useState<Filters>({ series: ["EQ"] });
  const [results, setResults]           = useState<ScanResult[]>([]);
  const [tradeDate, setTradeDate]       = useState("");
  const [totalMatches, setTotalMatches] = useState(0);
  const [loading, setLoading]           = useState(false);
  const [sortBy, setSortBy]             = useState("volume_ratio");
  const [sortOrder, setSortOrder]       = useState("desc");
  const [selected, setSelected]         = useState<ScanResult | null>(null);
  const [hasRun, setHasRun]             = useState(false);
  const [scanError, setScanError]       = useState("");

  useEffect(() => { getScannerPresets().then(setPresets); }, []);

  const setFilter = useCallback((k: string, v: unknown) => {
    setFilters(f => ({ ...f, [k]: v }));
    setActivePreset(null);
  }, []);

  function applyPreset(p: ScanPreset) {
    const f = p.filters as Filters;
    setFilters(f);
    setActivePreset(p.id);
    scan(f);
  }

  function resetFilters() {
    setFilters({ series: ["EQ"] });
    setActivePreset(null);
  }

  async function scan(overrideFilters?: Filters) {
    setLoading(true);
    setSelected(null);
    setScanError("");
    try {
      const active = overrideFilters ?? filters;
      const clean: Filters = {};
      for (const [k, v] of Object.entries(active)) {
        if (v !== null && v !== undefined && v !== "") clean[k] = v;
      }
      const data = await runScanner(clean, sortBy, sortOrder);
      setResults(data.results);
      setTotalMatches(data.total_matches);
      setTradeDate(data.trade_date);
      setHasRun(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Scan failed";
      setScanError(msg);
      setHasRun(true);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex overflow-hidden" style={{ height: "calc(100vh - 48px)" }}>
      {/* LEFT FILTER PANEL */}
      <div className="w-[260px] flex-shrink-0 bg-white border-r border-[#e8e8e6] flex flex-col overflow-hidden">
        <div className="px-3 pt-3 pb-2 border-b border-[#f0f0ee]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[#aaa] mb-2">Presets</div>
          <div className="grid grid-cols-2 gap-1.5">
            {presets.map(p => (
              <button key={p.id} onClick={() => applyPreset(p)}
                className={`text-left px-2 py-1.5 rounded-[6px] border text-[11px] transition-all leading-tight ${
                  activePreset === p.id
                    ? "border-[#5b63f5] bg-[#eeeffe] text-[#5b63f5] font-semibold"
                    : "border-[#e8e8e6] text-[#555] hover:border-[#ccc]"
                }`}>
                <span className="w-1.5 h-1.5 rounded-full inline-block mr-1 align-middle" style={{ background: p.color }} />
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <Section title="Price" open>
            <RangeRow label="Price (₹)" keyMin="price_min" keyMax="price_max" filters={filters} onChange={setFilter} />
            <RangeRow label="% Change today" keyMin="pct_change_min" keyMax="pct_change_max" filters={filters} onChange={setFilter} />
            <RangeRow label="Gap %" keyMin="gap_pct_min" keyMax="gap_pct_max" filters={filters} onChange={setFilter} />
          </Section>
          <Section title="Volume">
            <RangeRow label="Volume ratio (×avg)" keyMin="volume_ratio_min" keyMax="volume_ratio_max" filters={filters} onChange={setFilter} />
            <RangeRow label="Turnover min (₹ Cr)" keyMin="turnover_min_cr" keyMax="" filters={filters} onChange={setFilter} />
            <RangeRow label="Delivery %" keyMin="delivery_pct_min" keyMax="delivery_pct_max" filters={filters} onChange={setFilter} />
          </Section>
          <Section title="Moving Averages">
            <SelectRow label="Price vs EMA 20" filterKey="price_vs_ema20" options={[{value:"above",label:"Above"},{value:"below",label:"Below"}]} filters={filters} onChange={setFilter} />
            <SelectRow label="Price vs EMA 50" filterKey="price_vs_ema50" options={[{value:"above",label:"Above"},{value:"below",label:"Below"}]} filters={filters} onChange={setFilter} />
            <SelectRow label="Price vs EMA 200" filterKey="price_vs_ema200" options={[{value:"above",label:"Above"},{value:"below",label:"Below"}]} filters={filters} onChange={setFilter} />
            <SelectRow label="EMA 20 vs 50" filterKey="ema20_vs_ema50" options={[{value:"golden",label:"Golden cross"},{value:"death",label:"Death cross"}]} filters={filters} onChange={setFilter} />
            <SelectRow label="EMA 50 vs 200" filterKey="ema50_vs_ema200" options={[{value:"golden",label:"Golden cross"},{value:"death",label:"Death cross"}]} filters={filters} onChange={setFilter} />
          </Section>
          <Section title="Momentum">
            <RangeRow label="RSI 14" keyMin="rsi_min" keyMax="rsi_max" filters={filters} onChange={setFilter} />
            <RangeRow label="Stochastic %K" keyMin="stoch_k_min" keyMax="stoch_k_max" filters={filters} onChange={setFilter} />
            <RangeRow label="ADX" keyMin="adx_min" keyMax="adx_max" filters={filters} onChange={setFilter} />
            <RangeRow label="CCI 20" keyMin="cci_min" keyMax="cci_max" filters={filters} onChange={setFilter} />
            <RangeRow label="Williams %R" keyMin="williams_r_min" keyMax="williams_r_max" filters={filters} onChange={setFilter} />
          </Section>
          <Section title="MACD">
            <SelectRow label="Signal" filterKey="macd_signal"
              options={[{value:"above_signal",label:"Above signal"},{value:"below_signal",label:"Below signal"}]}
              filters={filters} onChange={setFilter} />
            <SelectRow label="Histogram" filterKey="macd_hist_positive_str"
              options={[{value:"true",label:"Positive"},{value:"false",label:"Negative"}]}
              filters={filters} onChange={(k, v) => setFilter("macd_hist_positive", v === "true" ? true : v === "false" ? false : null)} />
          </Section>
          <Section title="Bollinger Bands">
            <SelectRow label="BB Position" filterKey="bb_position"
              options={[
                {value:"above_upper",label:"Above upper"},{value:"below_lower",label:"Below lower"},
                {value:"inside",label:"Inside bands"},{value:"near_upper",label:"Near upper"},{value:"near_lower",label:"Near lower"},
              ]}
              filters={filters} onChange={setFilter} />
            <RangeRow label="BB Width" keyMin="bb_width_min" keyMax="bb_width_max" filters={filters} onChange={setFilter} />
          </Section>
          <Section title="Volatility">
            <RangeRow label="ATR 14" keyMin="atr_min" keyMax="atr_max" filters={filters} onChange={setFilter} />
            <RangeRow label="ATR % of price" keyMin="atr_pct_min" keyMax="atr_pct_max" filters={filters} onChange={setFilter} />
          </Section>
          <Section title="52-Week Range">
            <RangeRow label="% from 52W high (max)" keyMin="" keyMax="week_52_high_pct_max" filters={filters} onChange={setFilter} />
            <ToggleRow label="New 52W high today" filterKey="new_52w_high" filters={filters} onChange={setFilter} />
            <ToggleRow label="New 52W low today" filterKey="new_52w_low" filters={filters} onChange={setFilter} />
          </Section>
          <Section title="Candle Patterns">
            <ToggleRow label="Inside bar" filterKey="is_inside_bar" filters={filters} onChange={setFilter} />
            <ToggleRow label="Hammer" filterKey="hammer" filters={filters} onChange={setFilter} />
            <ToggleRow label="Shooting star" filterKey="shooting_star" filters={filters} onChange={setFilter} />
            <ToggleRow label="Doji" filterKey="doji" filters={filters} onChange={setFilter} />
          </Section>
        </div>

        <div className="p-3 border-t border-[#e8e8e6] flex flex-col gap-2">
          <button onClick={() => scan()} disabled={loading}
            className="w-full py-2 rounded-[8px] text-[13px] font-bold text-white transition-opacity disabled:opacity-60"
            style={{ background: "#0f0f0e" }}>
            {loading ? "Scanning…" : "Run Scan"}
          </button>
          <button onClick={resetFilters} className="w-full text-[12px] text-[#aaa] hover:text-[#555] transition-colors">
            Reset all filters
          </button>
        </div>
      </div>

      {/* RIGHT RESULTS */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="bg-white border-b border-[#e8e8e6] px-4 py-2 flex items-center gap-3 flex-shrink-0">
          {scanError ? (
            <span className="text-[13px] text-[#e5383b]">{scanError}</span>
          ) : hasRun ? (
            <span className="text-[13px] text-[#555]">
              <span className="font-semibold text-[#1c1c1a]">{totalMatches}</span> stocks matched
              {tradeDate && <span className="text-[#aaa] ml-2">· EOD {tradeDate}</span>}
            </span>
          ) : (
            <span className="text-[13px] text-[#aaa]">Select filters and run scan</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] text-[#aaa]">Sort:</span>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              className="text-[12px] border border-[#e2e2df] rounded-[6px] px-2 py-1 outline-none bg-white">
              <option value="volume_ratio">Vol ratio</option>
              <option value="pct_change">% Change</option>
              <option value="rsi_14">RSI</option>
              <option value="close">Price</option>
              <option value="week_52_high_pct">52W high%</option>
            </select>
            <button onClick={() => setSortOrder(o => o === "desc" ? "asc" : "desc")}
              className="text-[12px] text-[#5b63f5] font-medium w-5">
              {sortOrder === "desc" ? "↓" : "↑"}
            </button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 overflow-auto">
            {!hasRun ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <div className="w-12 h-12 rounded-full bg-[#eeeffe] flex items-center justify-center mb-3">
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="8" stroke="#5b63f5" strokeWidth="2"/>
                    <path d="m21 21-4.35-4.35" stroke="#5b63f5" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <p className="text-[14px] font-semibold text-[#1c1c1a]">Run a scan</p>
                <p className="text-[12px] text-[#aaa] mt-1">Pick a preset or configure filters, then click Run Scan</p>
              </div>
            ) : loading ? (
              <div className="p-6 space-y-2">
                {Array.from({length:8}).map((_,i) => (
                  <div key={i} className="h-9 bg-white border border-[#e8e8e6] rounded animate-pulse" />
                ))}
              </div>
            ) : results.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full">
                <p className="text-[14px] font-semibold text-[#1c1c1a]">No matches</p>
                <p className="text-[12px] text-[#aaa] mt-1">Try relaxing the filters</p>
              </div>
            ) : (
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-white border-b border-[#e8e8e6] z-10">
                  <tr>
                    {["Symbol","Close ₹","Change%","Vol Ratio","RSI","EMA dist","52W%","ATR%",""].map((h,i) => (
                      <th key={i} className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-[#aaa] font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map(r => (
                    <tr key={r.symbol}
                      onClick={() => setSelected(s => s?.symbol === r.symbol ? null : r)}
                      className={`border-b border-[#f2f2f0] cursor-pointer transition-colors ${
                        selected?.symbol === r.symbol ? "bg-[#eeeffe]" : "hover:bg-[#fafaf8]"
                      }`}>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-[#1c1c1a]">{r.symbol}</div>
                        <div className="text-[10px] text-[#aaa] truncate max-w-[110px]">{r.company_name}</div>
                      </td>
                      <td className="px-3 py-2 tabular font-semibold text-[#1c1c1a]">₹{r.close.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-2 tabular font-semibold" style={{ color: pctColor(r.pct_change) }}>
                        {r.pct_change != null ? `${r.pct_change >= 0 ? "+" : ""}${r.pct_change.toFixed(2)}%` : "—"}
                      </td>
                      <td className="px-3 py-2 tabular" style={{ color: (r.volume_ratio ?? 0) >= 2 ? "#5b63f5" : "#555" }}>
                        {r.volume_ratio != null ? `${r.volume_ratio.toFixed(1)}×` : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {r.rsi_14 != null ? (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold tabular ${rsiClass(r.rsi_14)}`}>
                            {r.rsi_14.toFixed(1)}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2 tabular">
                        {r.ema_20 && r.close ? (
                          <span style={{ color: r.close > r.ema_20 ? "#26a65b" : "#e5383b" }}>
                            {r.close > r.ema_20 ? "+" : ""}{((r.close - r.ema_20) / r.ema_20 * 100).toFixed(1)}%
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2 tabular text-[#888]">
                        {r.week_52_high_pct != null ? `${r.week_52_high_pct.toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-3 py-2 tabular text-[#888]">
                        {r.atr_pct != null ? `${r.atr_pct.toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={e => { e.stopPropagation(); router.push(`/watchlist?add=${r.symbol}`); }}
                          className="text-[10px] text-[#5b63f5] hover:underline whitespace-nowrap font-semibold">
                          +WL
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Side detail panel */}
          {selected && (
            <div className="w-[240px] flex-shrink-0 bg-white border-l border-[#e8e8e6] overflow-y-auto p-4">
              <div className="flex justify-between mb-3">
                <div>
                  <div className="text-[15px] font-bold text-[#1c1c1a]">{selected.symbol}</div>
                  <div className="text-[11px] text-[#aaa]">{selected.company_name}</div>
                  {selected.sector && (
                    <span className="inline-block mt-1 text-[10px] font-semibold bg-[#eeeffe] text-[#5b63f5] px-2 py-0.5 rounded-full">{selected.sector}</span>
                  )}
                </div>
                <button onClick={() => setSelected(null)} className="text-[#bbb] text-lg leading-none">×</button>
              </div>
              <div className="text-[22px] font-bold tabular">₹{selected.close.toLocaleString("en-IN")}</div>
              <div className="text-[13px] font-semibold tabular mb-3" style={{ color: pctColor(selected.pct_change) }}>
                {selected.pct_change != null ? `${selected.pct_change >= 0 ? "+" : ""}${selected.pct_change.toFixed(2)}%` : "—"}
              </div>
              <div className="grid grid-cols-2 gap-1.5 mb-3 text-[12px]">
                {[["Open", `₹${selected.open}`],["High",`₹${selected.high}`],["Low",`₹${selected.low}`],["Volume",`${(selected.volume/1e6).toFixed(1)}M`]].map(([l,v]) => (
                  <div key={l} className="bg-[#f7f7f5] rounded px-2 py-1.5">
                    <div className="text-[10px] text-[#aaa]">{l}</div>
                    <div className="font-semibold">{v}</div>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5 text-[12px]">
                {[
                  ["RSI 14", selected.rsi_14?.toFixed(1) ?? "—"],
                  ["Vol ratio", selected.volume_ratio != null ? `${selected.volume_ratio.toFixed(1)}×` : "—"],
                  ["ATR %", selected.atr_pct != null ? `${selected.atr_pct.toFixed(2)}%` : "—"],
                  ["EMA 20", selected.ema_20?.toLocaleString("en-IN") ?? "—"],
                  ["EMA 50", selected.ema_50?.toLocaleString("en-IN") ?? "—"],
                  ["EMA 200", selected.ema_200?.toLocaleString("en-IN") ?? "—"],
                  ["52W High", selected.week_52_high?.toLocaleString("en-IN") ?? "—"],
                  ["52W High%", selected.week_52_high_pct != null ? `${selected.week_52_high_pct.toFixed(1)}%` : "—"],
                ].map(([l,v]) => (
                  <div key={l} className="flex justify-between">
                    <span className="text-[#aaa]">{l}</span>
                    <span className="font-semibold tabular">{v}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-col gap-2">
                <button onClick={() => router.push(`/watchlist?add=${selected.symbol}`)}
                  className="w-full py-2 rounded-[8px] text-[12px] font-bold text-white"
                  style={{ background: "#5b63f5" }}>
                  + Add to Watchlist
                </button>
                <button onClick={() => router.push(`/watchlist?symbol=${selected.symbol}`)}
                  className="w-full py-2 rounded-[8px] text-[12px] font-semibold border border-[#e2e2df] text-[#555] hover:bg-[#f7f7f5]">
                  View Chart →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
