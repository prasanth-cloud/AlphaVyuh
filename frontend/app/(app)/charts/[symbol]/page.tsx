"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { BookmarkPlus, Save } from "lucide-react";
import type {
  CandlesResponse, Drawing,
} from "@/lib/api";
import {
  getCandles, getIndicators, getDrawings, saveDrawing,
  getChartLayout, saveChartLayout, getWatchlists, addToWatchlist,
} from "@/lib/api";
import SymbolSearch from "@/components/charts/SymbolSearch";
import type { IndicatorData } from "@/components/charts/CandlestickChart";

type LinePoint = { time: string; value: number };
type MACDPoint = { time: string; macd: number | null; signal: number | null; histogram: number | null };
type StochPoint = { time: string; k: number; d: number | null };
import type { LogicalRange } from "lightweight-charts";

// Dynamically import chart components (browser-only)
const CandlestickChart = dynamic(
  () => import("@/components/charts/CandlestickChart"),
  { ssr: false, loading: () => <div className="animate-pulse bg-[#f7f7f5] h-full w-full" /> }
);
const IndicatorPanel = dynamic(
  () => import("@/components/charts/IndicatorPanel"),
  { ssr: false }
);

// ── Indicator config ──────────────────────────────────────────────────────────

const INDICATOR_CONFIG = [
  { id: "ema20",  label: "EMA 20",  color: "#5b63f5", bg: "#eeeffe" },
  { id: "ema50",  label: "EMA 50",  color: "#d97706", bg: "#fff8ec" },
  { id: "ema200", label: "EMA 200", color: "#e5383b", bg: "#fff0f0" },
  { id: "bb",     label: "BB",      color: "#888888", bg: "#f7f7f5" },
  { id: "vwap",   label: "VWAP",    color: "#7c6af0", bg: "#f0effb" },
  { id: "rsi",    label: "RSI",     color: "#5b63f5", bg: "#eeeffe" },
  { id: "macd",   label: "MACD",    color: "#5b63f5", bg: "#eeeffe" },
  { id: "stoch",  label: "Stoch",   color: "#26a65b", bg: "#edfaf3" },
];

const DRAWING_TOOLS = ["Trendline", "Horizontal", "Fib", "Text"] as const;
type DrawingTool = typeof DRAWING_TOOLS[number];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtVol(v: number): string {
  if (v >= 10_000_000) return `${(v / 10_000_000).toFixed(1)}Cr`;
  if (v >= 100_000) return `${(v / 100_000).toFixed(1)}L`;
  return v.toLocaleString("en-IN");
}

function fmtPrice(v: number | null | undefined): string {
  if (v == null) return "—";
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ChartPage({ params }: { params: { symbol: string } }) {
  const symbol = params.symbol.toUpperCase();
  const router = useRouter();

  const [timeframe, setTimeframe] = useState<"D" | "W" | "M">("D");

  const [data, setData] = useState<CandlesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [activeIndicators, setActiveIndicators] = useState<string[]>(["ema20", "ema50"]);
  const [activeDrawingTool, setActiveDrawingTool] = useState<DrawingTool | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);

  const [indicatorData, setIndicatorData] = useState<IndicatorData>({});
  const [rsiData, setRsiData] = useState<LinePoint[]>([]);
  const [macdData, setMacdData] = useState<MACDPoint[]>([]);
  const [stochData, setStochData] = useState<StochPoint[]>([]);

  // Crosshair legend
  const [legendBar, setLegendBar] = useState<{
    time: string; open: number; high: number; low: number; close: number; volume: number;
  } | null>(null);

  // Chart sync
  const [logicalRange, setLogicalRange] = useState<LogicalRange | null>(null);

  // Watchlist
  const [wlMsg, setWlMsg] = useState("");
  const [showWlPicker, setShowWlPicker] = useState(false);
  const [watchlists, setWatchlists] = useState<{ id: string; name: string }[]>([]);

  // Overlay drawing state
  const overlayRef = useRef<HTMLDivElement>(null);
  const drawingStartRef = useRef<{ x: number; y: number } | null>(null);
  const [drawingPreview, setDrawingPreview] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  // Load chart data
  useEffect(() => {
    setLoading(true);
    setError("");
    setData(null);
    setRsiData([]);
    setMacdData([]);
    setStochData([]);
    setIndicatorData({});

    const limit = timeframe === "D" ? 500 : timeframe === "W" ? 260 : 120;
    getCandles(symbol, { limit, timeframe })
      .then(d => {
        setData(d);
        setLegendBar(null);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [symbol, timeframe]);

  // Load saved layout
  useEffect(() => {
    getChartLayout(symbol).then(layout => {
      if (layout.indicators?.length) {
        setActiveIndicators(layout.indicators);
      }
    });
  }, [symbol]);

  // Load drawings
  useEffect(() => {
    getDrawings(symbol).then(setDrawings);
  }, [symbol]);

  // Fetch indicators when active set changes or data loads
  useEffect(() => {
    if (!data) return;
    const overlayInds = activeIndicators.filter(i => ["ema20", "ema50", "ema200", "bb", "vwap"].includes(i));
    const panelInds = activeIndicators.filter(i => ["rsi", "macd", "stoch"].includes(i));
    const allInds = Array.from(new Set([...overlayInds, ...panelInds]));
    if (!allInds.length) return;

    getIndicators(symbol, allInds, timeframe).then(resp => {
      const ind = resp.indicators as Record<string, unknown[]>;
      setIndicatorData({
        ema20:  ind.ema20  as LinePoint[] | undefined,
        ema50:  ind.ema50  as LinePoint[] | undefined,
        ema200: ind.ema200 as LinePoint[] | undefined,
        vwap:   ind.vwap   as LinePoint[] | undefined,
        bb:     ind.bb     as never,
      });
      if (ind.rsi)   setRsiData(ind.rsi as LinePoint[]);
      if (ind.macd)  setMacdData(ind.macd as MACDPoint[]);
      if (ind.stoch) setStochData(ind.stoch as StochPoint[]);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe, data, activeIndicators.join(",")]);

  function toggleIndicator(id: string) {
    setActiveIndicators(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  }

  const handleRangeChange = useCallback((range: LogicalRange | null) => {
    setLogicalRange(range);
  }, []);

  async function handleSaveLayout() {
    await saveChartLayout(symbol, { timeframe, indicators: activeIndicators, drawing_tools: [] });
  }

  async function handleAddWatchlist() {
    const wls = await getWatchlists();
    setWatchlists(wls.map(w => ({ id: w.id, name: w.name })));
    setShowWlPicker(true);
  }

  async function handlePickWl(wlId: string) {
    setShowWlPicker(false);
    try {
      await addToWatchlist(wlId, symbol);
      setWlMsg("Added!");
    } catch (e: unknown) {
      setWlMsg(e instanceof Error ? e.message : "Error");
    }
    setTimeout(() => setWlMsg(""), 2500);
  }

  // Drawing overlay handlers (horizontal + trendline)
  function handleOverlayMouseDown(e: React.MouseEvent) {
    if (!activeDrawingTool || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    drawingStartRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handleOverlayMouseMove(e: React.MouseEvent) {
    if (!activeDrawingTool || !drawingStartRef.current || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const x2 = e.clientX - rect.left;
    const y2 = e.clientY - rect.top;
    setDrawingPreview({ x1: drawingStartRef.current.x, y1: drawingStartRef.current.y, x2, y2 });
  }

  async function handleOverlayMouseUp(e: React.MouseEvent) {
    if (!activeDrawingTool || !drawingStartRef.current || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const x2 = e.clientX - rect.left;
    const y2 = e.clientY - rect.top;
    const start = drawingStartRef.current;
    drawingStartRef.current = null;
    setDrawingPreview(null);

    // Persist drawing
    const points = [
      { x: start.x / rect.width, y: start.y / rect.height },
      { x: x2 / rect.width, y: y2 / rect.height },
    ];
    try {
      const saved = await saveDrawing(symbol, {
        tool_type: activeDrawingTool.toLowerCase(),
        points,
        style: { color: "#5b63f5" },
        timeframe: "D",
      });
      setDrawings(prev => [...prev, saved]);
    } catch { /* ignore */ }

    setActiveDrawingTool(null);
  }

  const latest = data?.latest;
  const prevClose = latest?.prev_close;
  const changeAmt = latest && prevClose ? latest.close - prevClose : null;
  const changePct = latest?.pct_change;
  const positive = changePct != null ? changePct >= 0 : true;

  const w52pct = latest?.week_52_high && latest?.week_52_low
    ? ((latest.close - latest.week_52_low) / (latest.week_52_high - latest.week_52_low)) * 100
    : null;

  const pctFrom52H = latest?.week_52_high
    ? ((latest.week_52_high - latest.close) / latest.week_52_high) * 100
    : null;

  // Build crosshair legend text
  const displayBar = legendBar || (data?.candles.at(-1) ? {
    ...data.candles.at(-1)!,
  } : null);

  const showRsi   = activeIndicators.includes("rsi");
  const showMacd  = activeIndicators.includes("macd");
  const showStoch = activeIndicators.includes("stoch");

  return (
    <div className="flex flex-col h-screen bg-[#f2f2f0] overflow-hidden">

      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-[#e2e2df] gap-4 flex-shrink-0">
        {/* Left: symbol search + name */}
        <div className="flex items-center gap-3">
          <SymbolSearch
            value={symbol}
            onChange={sym => router.push(`/charts/${sym}`)}
          />
          {data && (
            <span className="text-[12px] text-[#aaa] hidden sm:block truncate max-w-[200px]">
              {data.company_name}
            </span>
          )}
        </div>

        {/* Right: timeframe + indicators + drawing tools + save */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Timeframe */}
          <div className="flex items-center gap-0.5 mr-1 bg-[#f7f7f5] rounded-[6px] p-0.5">
            {(["D", "W", "M"] as const).map(tf => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className="text-[11px] px-2.5 py-1 rounded-[4px] font-semibold transition-colors"
                style={timeframe === tf
                  ? { background: "#1c1c1a", color: "white" }
                  : { background: "transparent", color: "#888" }
                }
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Separator */}
          <div className="w-px h-5 bg-[#e2e2df]" />

          {/* Indicator toggles */}
          {INDICATOR_CONFIG.map(ind => {
            const active = activeIndicators.includes(ind.id);
            return (
              <button
                key={ind.id}
                onClick={() => toggleIndicator(ind.id)}
                className="text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors"
                style={active
                  ? { background: ind.bg, color: ind.color, border: `1px solid ${ind.color}44` }
                  : { background: "#f7f7f5", color: "#aaa", border: "1px solid #e2e2df" }
                }
              >
                {ind.label}
              </button>
            );
          })}

          {/* Separator */}
          <div className="w-px h-5 bg-[#e2e2df]" />

          {/* Drawing tools */}
          {DRAWING_TOOLS.map(tool => (
            <button
              key={tool}
              onClick={() => setActiveDrawingTool(t => t === tool ? null : tool)}
              className="text-[11px] px-2.5 py-1 rounded-[4px] font-medium transition-colors"
              style={activeDrawingTool === tool
                ? { background: "#eeeffe", color: "#5b63f5", border: "1px solid #5b63f544" }
                : { background: "#f7f7f5", color: "#888", border: "1px solid #e2e2df" }
              }
            >
              {tool}
            </button>
          ))}

          {/* Save layout */}
          <button
            onClick={handleSaveLayout}
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-[4px] border border-[#e2e2df] text-[#666] hover:border-[#5b63f5] hover:text-[#5b63f5] transition-colors"
          >
            <Save size={11} /> Save
          </button>
        </div>
      </div>

      {/* ── Body: sidebar + chart area ────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Sidebar */}
        <aside className="w-[240px] flex-shrink-0 bg-white border-r border-[#e2e2df] flex flex-col overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-3">
              {[80, 50, 60, 40, 70].map((w, i) => (
                <div key={i} className="h-3 rounded bg-[#f0f0ee] animate-pulse" style={{ width: `${w}%` }} />
              ))}
            </div>
          ) : error ? (
            <div className="p-4 text-[12px] text-[#e5383b]">{error}</div>
          ) : data && (
            <>
              {/* Symbol header */}
              <div className="p-4 border-b border-[#f0f0ee]">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[18px] font-bold text-[#1c1c1a] tracking-[-0.5px]">{symbol}</span>
                  {data.sector && (
                    <span className="text-[10px] border border-[#e2e2df] rounded-full px-2 py-0.5 text-[#888]">
                      {data.sector}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-[#aaa] leading-tight">{data.company_name}</div>

                <div className="mt-2.5">
                  <div className="text-[24px] font-bold text-[#1c1c1a] tracking-[-0.8px] tabular-nums">
                    {fmtPrice(latest?.close)}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[13px] font-semibold tabular-nums" style={{ color: positive ? "#26a65b" : "#e5383b" }}>
                      {positive ? "+" : ""}{changePct?.toFixed(2)}%
                    </span>
                    {changeAmt != null && (
                      <span className="text-[12px] tabular-nums" style={{ color: positive ? "#26a65b" : "#e5383b" }}>
                        {positive ? "+" : ""}{fmtPrice(changeAmt)} today
                      </span>
                    )}
                  </div>
                </div>

                {/* Add to watchlist */}
                <div className="mt-3 relative">
                  {wlMsg ? (
                    <div className={`text-[12px] font-medium text-center py-1.5 ${wlMsg === "Added!" ? "text-[#26a65b]" : "text-[#e5383b]"}`}>
                      {wlMsg}
                    </div>
                  ) : showWlPicker ? (
                    <div className="border border-[#e2e2df] rounded-[7px] overflow-hidden">
                      <div className="px-3 py-2 bg-[#f7f7f5] text-[11px] text-[#888]">Pick a watchlist</div>
                      {watchlists.map(wl => (
                        <button key={wl.id} onClick={() => handlePickWl(wl.id)}
                          className="w-full text-left px-3 py-2 text-[12px] text-[#1c1c1a] hover:bg-[#f7f7f5] border-t border-[#f0f0ee]">
                          {wl.name}
                        </button>
                      ))}
                      <button onClick={() => setShowWlPicker(false)}
                        className="w-full text-left px-3 py-2 text-[12px] text-[#888] hover:bg-[#f7f7f5] border-t border-[#f0f0ee]">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button onClick={handleAddWatchlist}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-[7px] border border-[#e2e2df] text-[12px] text-[#666] hover:border-[#1c1c1a] hover:text-[#1c1c1a] transition-colors">
                      <BookmarkPlus size={13} /> Add to watchlist
                    </button>
                  )}
                </div>
              </div>

              {/* OHLCV */}
              <div className="p-4 border-b border-[#f0f0ee]">
                <div className="text-[10px] uppercase tracking-[0.5px] text-[#aaa] mb-2 font-medium">OHLCV today</div>
                <div className="space-y-1.5">
                  {[
                    ["Open",   fmtPrice(latest?.open)],
                    ["High",   fmtPrice(latest?.high)],
                    ["Low",    fmtPrice(latest?.low)],
                    ["Close",  fmtPrice(latest?.close)],
                    ["Volume", latest?.volume ? fmtVol(latest.volume) : "—"],
                  ].map(([label, val]) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-[11px] text-[#aaa]">{label}</span>
                      <span className="text-[12px] font-medium tabular-nums text-[#1c1c1a]">{val}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Key metrics */}
              <div className="p-4 border-b border-[#f0f0ee]">
                <div className="text-[10px] uppercase tracking-[0.5px] text-[#aaa] mb-2 font-medium">Key Metrics</div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[#aaa]">RSI 14</span>
                    {latest?.rsi_14 != null ? (
                      <span className="text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-full"
                        style={{
                          background: latest.rsi_14 > 70 ? "#f0efff" : latest.rsi_14 < 40 ? "#fff8ec" : "#edfaf3",
                          color: latest.rsi_14 > 70 ? "#5b63f5" : latest.rsi_14 < 40 ? "#d97706" : "#26a65b",
                        }}>
                        {latest.rsi_14.toFixed(1)}
                      </span>
                    ) : <span className="text-[#aaa] text-[11px]">—</span>}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[#aaa]">Vol Ratio</span>
                    <span className="text-[12px] font-medium tabular-nums" style={{ color: "#7c6af0" }}>
                      {latest?.volume_ratio != null ? `${latest.volume_ratio.toFixed(2)}x` : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[#aaa]">ATR 14</span>
                    <span className="text-[12px] font-medium tabular-nums text-[#1c1c1a]">
                      {latest?.atr_14 != null ? fmtPrice(latest.atr_14) : "—"}
                    </span>
                  </div>
                </div>
              </div>

              {/* EMA stack */}
              <div className="p-4 border-b border-[#f0f0ee]">
                <div className="text-[10px] uppercase tracking-[0.5px] text-[#aaa] mb-2 font-medium">EMA Levels</div>
                <div className="space-y-1.5">
                  {([
                    ["EMA 20", latest?.ema_20, "#5b63f5"],
                    ["EMA 50", latest?.ema_50, "#d97706"],
                    ["EMA 200", latest?.ema_200, "#e5383b"],
                  ] as [string, number | null | undefined, string][]).map(([label, ema, color]) => {
                    const above = ema != null && latest?.close != null && latest.close > ema;
                    return (
                      <div key={label} className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                          <span className="text-[11px] text-[#aaa]">{label}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] tabular-nums text-[#888]">{fmtPrice(ema)}</span>
                          {ema != null && (
                            <span className="text-[11px] font-bold" style={{ color: above ? "#26a65b" : "#e5383b" }}>
                              {above ? "↑" : "↓"}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 52W range */}
              {latest?.week_52_high && latest?.week_52_low && (
                <div className="p-4">
                  <div className="text-[10px] uppercase tracking-[0.5px] text-[#aaa] mb-2 font-medium">52-Week Range</div>
                  <div className="relative h-[3px] bg-[#f0f0ee] rounded-full mx-1 my-3">
                    <div className="absolute h-[3px] bg-[#5b63f5] rounded-full"
                      style={{ width: `${Math.min(100, Math.max(0, w52pct ?? 0))}%` }} />
                    <div className="absolute w-2.5 h-2.5 bg-[#1c1c1a] rounded-full border-2 border-white -translate-y-[35%] -translate-x-1/2"
                      style={{ left: `${Math.min(100, Math.max(0, w52pct ?? 0))}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] tabular-nums text-[#aaa]">
                    <span>{fmtPrice(latest.week_52_low)}</span>
                    <span>{fmtPrice(latest.week_52_high)}</span>
                  </div>
                  {pctFrom52H != null && (
                    <div className="text-[10px] text-center text-[#aaa] mt-1">
                      {pctFrom52H.toFixed(1)}% from 52W high
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </aside>

        {/* Chart area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white">
          {/* OHLCV legend / crosshair overlay */}
          <div className="relative flex-1 min-h-0">
            {/* Candle legend */}
            {displayBar && (
              <div className="absolute top-2 left-3 z-10 pointer-events-none bg-white/80 rounded px-2 py-1 text-[11px] text-[#888] font-mono">
                <span className="text-[#1c1c1a] font-semibold mr-2">{symbol}</span>
                <span className="mr-3">{displayBar.time}</span>
                <span className="mr-2">O <span className="text-[#1c1c1a]">{displayBar.open?.toFixed(2)}</span></span>
                <span className="mr-2">H <span className="text-[#1c1c1a]">{displayBar.high?.toFixed(2)}</span></span>
                <span className="mr-2">L <span className="text-[#1c1c1a]">{displayBar.low?.toFixed(2)}</span></span>
                <span className="mr-2">C <span className={displayBar.close >= displayBar.open ? "text-[#26a65b]" : "text-[#e5383b]"}>{displayBar.close?.toFixed(2)}</span></span>
                <span>Vol <span className="text-[#1c1c1a]">{fmtVol(displayBar.volume)}</span></span>
              </div>
            )}

            {/* Drawing SVG overlay */}
            <div
              ref={overlayRef}
              className="absolute inset-0 z-20"
              style={{ cursor: activeDrawingTool ? "crosshair" : "default", pointerEvents: activeDrawingTool ? "all" : "none" }}
              onMouseDown={handleOverlayMouseDown}
              onMouseMove={handleOverlayMouseMove}
              onMouseUp={handleOverlayMouseUp}
            >
              {/* Preview line while drawing */}
              {drawingPreview && (
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                  <line
                    x1={drawingPreview.x1} y1={drawingPreview.y1}
                    x2={drawingPreview.x2}
                    y2={activeDrawingTool === "Horizontal" ? drawingPreview.y1 : drawingPreview.y2}
                    stroke="#5b63f5" strokeWidth={1.5} strokeDasharray="4 3"
                  />
                </svg>
              )}

              {/* Persisted drawings (pixel-coordinate approximation) */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                {drawings.map(d => {
                  if (!overlayRef.current) return null;
                  const w = overlayRef.current.clientWidth;
                  const h = overlayRef.current.clientHeight;
                  const pts = d.points as { x: number; y: number }[];
                  if (pts.length < 2) return null;
                  return (
                    <line key={d.id}
                      x1={pts[0].x * w} y1={pts[0].y * h}
                      x2={pts[1].x * w}
                      y2={d.tool_type === "horizontal" ? pts[0].y * h : pts[1].y * h}
                      stroke={(d.style as { color?: string }).color || "#5b63f5"}
                      strokeWidth={1.5}
                    />
                  );
                })}
              </svg>
            </div>

            {/* Main chart */}
            {data && (
              <CandlestickChart
                candles={data.candles}
                indicators={indicatorData}
                activeIndicators={activeIndicators}
                onCrosshairMove={bar => setLegendBar(bar)}
                onRangeChange={handleRangeChange}
              />
            )}
          </div>

          {/* RSI panel */}
          {showRsi && rsiData.length > 0 && (
            <IndicatorPanel
              type="rsi"
              data={rsiData}
              height={110}
              logicalRange={logicalRange}
              onRangeChange={handleRangeChange}
            />
          )}

          {/* MACD panel */}
          {showMacd && macdData.length > 0 && (
            <IndicatorPanel
              type="macd"
              data={macdData}
              height={110}
              logicalRange={logicalRange}
              onRangeChange={handleRangeChange}
            />
          )}

          {/* Stochastic panel */}
          {showStoch && stochData.length > 0 && (
            <IndicatorPanel
              type="stoch"
              data={stochData}
              height={110}
              logicalRange={logicalRange}
              onRangeChange={handleRangeChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}
