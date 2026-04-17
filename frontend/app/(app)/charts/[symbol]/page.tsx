"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { BookmarkPlus, Save } from "lucide-react";
import type {
  CandlesResponse, Drawing, Fundamentals, OrderResult,
} from "@/lib/api";
import {
  getCandles, getIndicators, getDrawings, saveDrawing,
  getChartLayout, saveChartLayout, getWatchlists, addToWatchlist,
  getFundamentals, getPlanStatus, getQuote, getBrokerStatus,
} from "@/lib/api";
import SymbolSearch from "@/components/charts/SymbolSearch";
import OrderModal from "@/components/charts/OrderModal";
import type { IndicatorData, IchimokuPoint, ChartHandle } from "@/components/charts/CandlestickChart";

type LinePoint = { time: string; value: number };
type MACDPoint = { time: string; macd: number | null; signal: number | null; histogram: number | null };
type StochPoint = { time: string; k: number; d: number | null };
import type { LogicalRange } from "lightweight-charts";

type DrawnLine = {
  id: string;
  tool: "Trendline" | "Horizontal" | "Fib";
  p1: { time: string; price: number };
  p2: { time: string; price: number };
  color: string;
};

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
  { id: "stoch",    label: "Stoch",    color: "#26a65b", bg: "#edfaf3" },
  { id: "atr",      label: "ATR",      color: "#d97706", bg: "#fff8ec" },
  { id: "ichimoku", label: "Ichimoku", color: "#7c6af0", bg: "#f0effb" },
];

const DRAWING_TOOLS = ["Trendline", "Horizontal", "Fib", "Text"] as const;
type DrawingTool = typeof DRAWING_TOOLS[number];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtVol(v: number): string {
  if (v >= 10_000_000) return `${(v / 10_000_000).toFixed(1)}Cr`;
  if (v >= 100_000) return `${(v / 100_000).toFixed(1)}L`;
  return v.toLocaleString("en-IN");
}

function fmtPrice(v: number | null | undefined, currency = "INR"): string {
  if (v == null) return "—";
  if (currency === "USD") {
    return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
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
  const [, setDrawings] = useState<Drawing[]>([]);
  const [drawnLines, setDrawnLines] = useState<DrawnLine[]>([]);
  const candleChartRef = useRef<ChartHandle>(null);
  const chartHandleRef = useRef<ChartHandle | null>(null);

  const [indicatorData, setIndicatorData] = useState<IndicatorData>({});
  const [rsiData, setRsiData] = useState<LinePoint[]>([]);
  const [macdData, setMacdData] = useState<MACDPoint[]>([]);
  const [stochData, setStochData] = useState<StochPoint[]>([]);
  const [atrData, setAtrData] = useState<LinePoint[]>([]);

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

  // Fundamentals & Technicals accordions
  const [fundamentals, setFundamentals] = useState<Fundamentals | null>(null);
  const [showFundamentals, setShowFundamentals] = useState(false);
  const [showTechnicals, setShowTechnicals] = useState(true);

  // Order modal
  const [showOrder, setShowOrder] = useState(false);
  const [orderSide, setOrderSide] = useState<"buy" | "sell">("buy");
  const [orderToast, setOrderToast] = useState("");

  // Broker status
  const [brokerConnected, setBrokerConnected] = useState(false);

  // Plan (for indicator gating)
  const [userPlan, setUserPlan] = useState<string>("free");
  const [symbolCurrency, setSymbolCurrency] = useState<string>("INR");
  const [planUpgradeToast, setPlanUpgradeToast] = useState("");
  const FREE_INDICATORS = ["ema20", "ema50", "ema200", "rsi"];

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
    setAtrData([]);
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

  // Load saved layout + plan
  useEffect(() => {
    getChartLayout(symbol).then(layout => {
      if (layout.indicators?.length) {
        setActiveIndicators(layout.indicators);
      }
    });
    getPlanStatus().then(s => setUserPlan(s.plan)).catch(() => {});
    getQuote(symbol).then(q => { if (q?.currency) setSymbolCurrency(q.currency); }).catch(() => {});
    getBrokerStatus().then(s => setBrokerConnected(s.connected)).catch(() => {});
  }, [symbol]);

  // Load fundamentals when sidebar fundamentals section is opened
  useEffect(() => {
    if (!showFundamentals || fundamentals?.symbol === symbol) return;
    setFundamentals(null);
    getFundamentals(symbol).then(f => setFundamentals(f));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFundamentals, symbol]);

  // Load drawings — parse new price/time format, skip old pixel-ratio format
  useEffect(() => {
    getDrawings(symbol, timeframe).then(list => {
      setDrawings(list);
      const lines: DrawnLine[] = list.flatMap(d => {
        const pts = d.points as { time?: string; price?: number; x?: number; y?: number }[];
        if (pts.length < 2 || !pts[0].time || pts[0].price == null) return [];
        return [{
          id: d.id,
          tool: d.tool_type === "horizontal" ? "Horizontal" : d.tool_type === "fib" ? "Fib" : "Trendline",
          p1: { time: pts[0].time, price: pts[0].price },
          p2: { time: pts[1].time ?? pts[0].time, price: pts[1].price ?? pts[0].price },
          color: (d.style as { color?: string }).color ?? "#5b63f5",
        } as DrawnLine];
      });
      setDrawnLines(lines);
    });
  }, [symbol, timeframe]);

  // Fetch indicators when active set changes or data loads
  useEffect(() => {
    if (!data) return;
    const overlayInds = activeIndicators.filter(i => ["ema20", "ema50", "ema200", "bb", "vwap", "ichimoku"].includes(i));
    const panelInds = activeIndicators.filter(i => ["rsi", "macd", "stoch", "atr"].includes(i));
    const allInds = Array.from(new Set([...overlayInds, ...panelInds]));
    if (!allInds.length) return;

    getIndicators(symbol, allInds, timeframe).then(resp => {
      const ind = resp.indicators as Record<string, unknown[]>;
      setIndicatorData({
        ema20:    ind.ema20    as LinePoint[] | undefined,
        ema50:    ind.ema50    as LinePoint[] | undefined,
        ema200:   ind.ema200   as LinePoint[] | undefined,
        vwap:     ind.vwap     as LinePoint[] | undefined,
        bb:       ind.bb       as never,
        ichimoku: ind.ichimoku as IchimokuPoint[] | undefined,
      });
      if (ind.rsi)   setRsiData(ind.rsi as LinePoint[]);
      if (ind.macd)  setMacdData(ind.macd as MACDPoint[]);
      if (ind.stoch) setStochData(ind.stoch as StochPoint[]);
      if (ind.atr)   setAtrData(ind.atr as LinePoint[]);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe, data, activeIndicators.join(",")]);

  function toggleIndicator(id: string) {
    const isPro = !FREE_INDICATORS.includes(id);
    if (isPro && userPlan === "free" && !activeIndicators.includes(id)) {
      setPlanUpgradeToast("Upgrade to Pro to use BB, VWAP, MACD, Stoch, ATR and Ichimoku");
      setTimeout(() => setPlanUpgradeToast(""), 3000);
      return;
    }
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

  // Drawing overlay handlers — store price/time coordinates for zoom/pan stability
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

    // Convert pixel → price/time using chart API
    const price1 = chartHandleRef.current?.coordinateToPrice(start.y) ?? null;
    const time1  = chartHandleRef.current?.coordinateToTime(start.x) ?? null;
    const price2 = chartHandleRef.current?.coordinateToPrice(y2) ?? null;
    const time2  = chartHandleRef.current?.coordinateToTime(x2) ?? null;

    if (price1 == null || time1 == null || price2 == null || time2 == null) return;

    const finalPrice2 = activeDrawingTool === "Horizontal" ? price1 : price2;
    const line: DrawnLine = {
      id: crypto.randomUUID(),
      tool: activeDrawingTool as DrawnLine["tool"],
      p1: { time: time1, price: price1 },
      p2: { time: time2, price: finalPrice2 },
      color: "#5b63f5",
    };
    setDrawnLines(prev => [...prev, line]);
    setActiveDrawingTool(null);

    // Persist to DB (non-blocking)
    try {
      const saved = await saveDrawing(symbol, {
        tool_type: activeDrawingTool.toLowerCase(),
        points: [{ time: time1, price: price1 }, { time: time2, price: finalPrice2 }],
        style: { color: "#5b63f5" },
        timeframe,
      });
      setDrawings(prev => [...prev, saved]);
    } catch { /* ignore */ }
  }

  function clearDrawings() {
    setDrawnLines([]);
    setDrawings([]);
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
  const showAtr   = activeIndicators.includes("atr");

  return (
    <div className="flex flex-col bg-[#f2f2f0] overflow-hidden" style={{ height: "calc(100vh - 48px)" }}>

      {planUpgradeToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#1c1c1a] text-white text-[13px] px-4 py-2 rounded-lg shadow-lg pointer-events-none flex items-center gap-2">
          <span>{planUpgradeToast}</span>
          <a href="/settings/billing" className="underline text-[#a5aaff] text-[12px] pointer-events-auto">Upgrade →</a>
        </div>
      )}

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
            const locked = !FREE_INDICATORS.includes(ind.id) && userPlan === "free";
            return (
              <button
                key={ind.id}
                onClick={() => toggleIndicator(ind.id)}
                title={locked ? "Pro plan required" : undefined}
                className="text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors flex items-center gap-1"
                style={active
                  ? { background: ind.bg, color: ind.color, border: `1px solid ${ind.color}44` }
                  : locked
                    ? { background: "#f7f7f5", color: "#ccc", border: "1px solid #e8e8e6" }
                    : { background: "#f7f7f5", color: "#aaa", border: "1px solid #e2e2df" }
                }
              >
                {locked && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><rect x="1.5" y="3.5" width="5" height="4" rx="0.5" fill="currentColor"/><path d="M2.5 3.5V2.5a1.5 1.5 0 013 0v1" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>}
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

          {/* Clear drawings */}
          {drawnLines.length > 0 && (
            <button
              onClick={clearDrawings}
              className="text-[11px] px-2.5 py-1 rounded-[4px] border border-[#e2e2df] text-[#e5383b] hover:border-[#e5383b] transition-colors"
            >
              Clear
            </button>
          )}

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

        {/* Order modal */}
        {showOrder && latest?.close != null && (
          <OrderModal
            symbol={symbol}
            currentPrice={latest.close}
            defaultSide={orderSide}
            onClose={() => setShowOrder(false)}
            onFilled={(result: OrderResult) => {
              setShowOrder(false);
              setOrderToast(result.message);
              setTimeout(() => setOrderToast(""), 5000);
            }}
          />
        )}

        {/* Order toast */}
        {orderToast && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 bg-[#1c1c1a] text-white text-[13px] px-4 py-2.5 rounded-full shadow-xl pointer-events-none">
            {orderToast}
          </div>
        )}

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
                    <span className="text-[10px] border border-[#e2e2df] rounded-full px-2 py-0.5 text-[#888] truncate max-w-[90px]">
                      {data.sector}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-[#aaa] leading-tight truncate">{data.company_name}</div>

                <div className="mt-2">
                  <div className="text-[22px] font-bold text-[#1c1c1a] tracking-[-0.8px] tabular-nums">
                    {fmtPrice(latest?.close, symbolCurrency)}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[12px] font-semibold tabular-nums" style={{ color: positive ? "#26a65b" : "#e5383b" }}>
                      {positive ? "+" : ""}{changePct?.toFixed(2)}%
                    </span>
                    {changeAmt != null && (
                      <span className="text-[11px] tabular-nums" style={{ color: positive ? "#26a65b" : "#e5383b" }}>
                        {positive ? "+" : ""}{fmtPrice(changeAmt, symbolCurrency)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Add to watchlist */}
                <div className="mt-2.5 relative">
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
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-[7px] border border-[#e2e2df] text-[11px] text-[#666] hover:border-[#1c1c1a] hover:text-[#1c1c1a] transition-colors">
                      <BookmarkPlus size={12} /> Add to watchlist
                    </button>
                  )}
                </div>
              </div>

              {/* Buy / Sell */}
              <div className="px-4 py-3 border-b border-[#f0f0ee] flex gap-2">
                <button
                  onClick={() => { setOrderSide("buy"); setShowOrder(true); }}
                  className="flex-1 py-2 bg-[#26a65b] text-white text-[13px] font-bold rounded-[8px] hover:opacity-90 transition-opacity"
                >
                  BUY
                </button>
                <button
                  onClick={() => { setOrderSide("sell"); setShowOrder(true); }}
                  className="flex-1 py-2 bg-[#e5383b] text-white text-[13px] font-bold rounded-[8px] hover:opacity-90 transition-opacity"
                >
                  SELL
                </button>
              </div>

              {/* ── Technicals accordion ─────────────────────────────── */}
              <div className="border-b border-[#f0f0ee]">
                <button
                  onClick={() => setShowTechnicals(t => !t)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-[#fafafa] transition-colors"
                >
                  <span className="text-[10px] uppercase tracking-[0.5px] text-[#555] font-semibold">Technicals</span>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                    className="transition-transform flex-shrink-0"
                    style={{ transform: showTechnicals ? "rotate(180deg)" : "rotate(0deg)" }}>
                    <path d="M2 4l4 4 4-4" stroke="#aaa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {showTechnicals && (
                  <div className="px-4 pb-4 space-y-4">
                    {/* OHLCV */}
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.5px] text-[#bbb] mb-1.5 font-semibold">OHLCV</div>
                      <div className="space-y-1">
                        {([
                          ["Open",   fmtPrice(latest?.open,  symbolCurrency)],
                          ["High",   fmtPrice(latest?.high,  symbolCurrency)],
                          ["Low",    fmtPrice(latest?.low,   symbolCurrency)],
                          ["Close",  fmtPrice(latest?.close, symbolCurrency)],
                          ["Volume", latest?.volume ? fmtVol(latest.volume) : "—"],
                        ] as [string, string][]).map(([label, val]) => (
                          <div key={label} className="flex items-center justify-between">
                            <span className="text-[11px] text-[#aaa]">{label}</span>
                            <span className="text-[11px] font-medium tabular-nums text-[#1c1c1a]">{val}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Key metrics */}
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.5px] text-[#bbb] mb-1.5 font-semibold">Momentum</div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-[#aaa]">RSI 14</span>
                          {latest?.rsi_14 != null ? (
                            <span className="text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full"
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
                          <span className="text-[11px] font-medium tabular-nums" style={{ color: "#7c6af0" }}>
                            {latest?.volume_ratio != null ? `${latest.volume_ratio.toFixed(2)}x` : "—"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-[#aaa]">ATR 14</span>
                          <span className="text-[11px] font-medium tabular-nums text-[#1c1c1a]">
                            {latest?.atr_14 != null ? fmtPrice(latest.atr_14, symbolCurrency) : "—"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* EMA stack */}
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.5px] text-[#bbb] mb-1.5 font-semibold">EMA Levels</div>
                      <div className="space-y-1">
                        {([
                          ["EMA 20",  latest?.ema_20,  "#5b63f5"],
                          ["EMA 50",  latest?.ema_50,  "#d97706"],
                          ["EMA 200", latest?.ema_200, "#e5383b"],
                        ] as [string, number | null | undefined, string][]).map(([label, ema, color]) => {
                          const above = ema != null && latest?.close != null && latest.close > ema;
                          return (
                            <div key={label} className="flex items-center justify-between">
                              <div className="flex items-center gap-1">
                                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                                <span className="text-[11px] text-[#aaa]">{label}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] tabular-nums text-[#888]">{fmtPrice(ema, symbolCurrency)}</span>
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
                      <div>
                        <div className="text-[9px] uppercase tracking-[0.5px] text-[#bbb] mb-1.5 font-semibold">52-Week Range</div>
                        <div className="relative h-[3px] bg-[#f0f0ee] rounded-full mx-0.5 my-2.5">
                          <div className="absolute h-[3px] bg-[#5b63f5] rounded-full"
                            style={{ width: `${Math.min(100, Math.max(0, w52pct ?? 0))}%` }} />
                          <div className="absolute w-2.5 h-2.5 bg-[#1c1c1a] rounded-full border-2 border-white -translate-y-[35%] -translate-x-1/2"
                            style={{ left: `${Math.min(100, Math.max(0, w52pct ?? 0))}%` }} />
                        </div>
                        <div className="flex justify-between text-[10px] tabular-nums text-[#aaa]">
                          <span>{fmtPrice(latest.week_52_low,  symbolCurrency)}</span>
                          <span>{fmtPrice(latest.week_52_high, symbolCurrency)}</span>
                        </div>
                        {pctFrom52H != null && (
                          <div className="text-[10px] text-center text-[#aaa] mt-0.5">
                            {pctFrom52H.toFixed(1)}% from 52W high
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Fundamentals accordion ───────────────────────────── */}
              <div className="border-b border-[#f0f0ee]">
                <button
                  onClick={() => setShowFundamentals(f => !f)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-[#fafafa] transition-colors"
                >
                  <span className="text-[10px] uppercase tracking-[0.5px] text-[#555] font-semibold">Fundamentals</span>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                    className="transition-transform flex-shrink-0"
                    style={{ transform: showFundamentals ? "rotate(180deg)" : "rotate(0deg)" }}>
                    <path d="M2 4l4 4 4-4" stroke="#aaa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {showFundamentals && (
                  <div className="px-4 pb-4">
                    {!fundamentals ? (
                      <div className="space-y-1.5">
                        {[1,2,3,4,5].map(i => (
                          <div key={i} className="h-3 bg-[#f0f0ee] rounded animate-pulse" />
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {([
                          ["Mkt Cap",    fundamentals.market_cap_str],
                          ["P/E (TTM)",  fundamentals.trailing_pe != null ? fundamentals.trailing_pe.toFixed(1) : null],
                          ["P/E (Fwd)",  fundamentals.forward_pe  != null ? fundamentals.forward_pe.toFixed(1)  : null],
                          ["P/B",        fundamentals.price_to_book != null ? fundamentals.price_to_book.toFixed(2) : null],
                          ["Div Yield",  fundamentals.dividend_yield != null ? `${fundamentals.dividend_yield}%` : null],
                          ["EPS (TTM)",  fundamentals.trailing_eps != null ? fmtPrice(fundamentals.trailing_eps, symbolCurrency) : null],
                          ["EPS (Fwd)",  fundamentals.forward_eps  != null ? fmtPrice(fundamentals.forward_eps,  symbolCurrency) : null],
                          ["Rev Growth", fundamentals.revenue_growth != null ? `${fundamentals.revenue_growth > 0 ? "+" : ""}${fundamentals.revenue_growth}%` : null],
                          ["Earn Grwth", fundamentals.earnings_growth != null ? `${fundamentals.earnings_growth > 0 ? "+" : ""}${fundamentals.earnings_growth}%` : null],
                          ["D/E Ratio",  fundamentals.debt_to_equity != null ? fundamentals.debt_to_equity.toFixed(1) : null],
                          ["ROE",        fundamentals.return_on_equity != null ? `${fundamentals.return_on_equity}%` : null],
                        ] as [string, string | null][]).filter(([, v]) => v != null).map(([label, val]) => (
                          <div key={label} className="flex items-center justify-between">
                            <span className="text-[11px] text-[#aaa]">{label}</span>
                            <span className="text-[11px] font-medium tabular-nums text-[#1c1c1a]">{val}</span>
                          </div>
                        ))}
                        <div className="text-[9px] text-[#ccc] mt-1">Source: Yahoo Finance</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {/* ── Broker connect panel ────────────────────────────── */}
              {!brokerConnected && (
                <div className="border-t border-[#f0f0ee] p-4">
                  <div className="text-[10px] uppercase tracking-[0.5px] text-[#bbb] mb-2 font-semibold">Quick order</div>
                  <div className="bg-[#eeeffe] rounded-[8px] p-3 text-center">
                    <div className="text-[12px] font-semibold text-[#3730a3] mb-0.5">Connect your broker</div>
                    <div className="text-[11px] text-[#6366f1] mb-2.5">Trade directly from the chart</div>
                    <Link
                      href="/settings?tab=profile"
                      className="inline-block text-[11px] font-semibold bg-[#5b63f5] text-white px-3 py-1.5 rounded-[6px] hover:opacity-85 transition-opacity"
                    >
                      Connect Zerodha
                    </Link>
                  </div>
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

              {/* Persisted drawings — projected from price/time coords each render */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                {drawnLines.map(line => {
                  const chartW = overlayRef.current?.clientWidth ?? 0;
                  const x1 = chartHandleRef.current?.timeToCoordinate(line.p1.time) ?? null;
                  const y1 = chartHandleRef.current?.priceToCoordinate(line.p1.price) ?? null;
                  if (x1 == null || y1 == null) return null;

                  if (line.tool === "Horizontal") {
                    return (
                      <g key={line.id}>
                        <line x1={0} y1={y1} x2={chartW} y2={y1}
                          stroke={line.color} strokeWidth={1.5} />
                        <text x={chartW - 4} y={y1 - 4} textAnchor="end"
                          fontSize="10" fill={line.color} fontFamily="monospace">
                          {line.p1.price.toFixed(2)}
                        </text>
                      </g>
                    );
                  }

                  const x2 = chartHandleRef.current?.timeToCoordinate(line.p2.time) ?? null;
                  const y2 = chartHandleRef.current?.priceToCoordinate(line.p2.price) ?? null;
                  if (x2 == null || y2 == null) return null;

                  if (line.tool === "Fib") {
                    const levels = [0, 0.236, 0.382, 0.5, 0.618, 1];
                    const priceRange = line.p2.price - line.p1.price;
                    return (
                      <g key={line.id}>
                        {levels.map(lvl => {
                          const priceLvl = line.p1.price + priceRange * (1 - lvl);
                          const yLvl = chartHandleRef.current?.priceToCoordinate(priceLvl) ?? null;
                          if (yLvl == null) return null;
                          const colors: Record<number, string> = {
                            0: "#888", 0.236: "#5b63f5", 0.382: "#26a65b",
                            0.5: "#d97706", 0.618: "#e5383b", 1: "#888"
                          };
                          return (
                            <g key={lvl}>
                              <line x1={x1} y1={yLvl} x2={x2} y2={yLvl}
                                stroke={colors[lvl] || "#5b63f5"} strokeWidth={1} strokeDasharray="3 2" />
                              <text x={x2 + 4} y={yLvl + 4} fontSize="9" fill={colors[lvl] || "#5b63f5"} fontFamily="monospace">
                                {(lvl * 100).toFixed(1)}%
                              </text>
                            </g>
                          );
                        })}
                      </g>
                    );
                  }

                  // Trendline
                  return (
                    <line key={line.id} x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke={line.color} strokeWidth={1.5} />
                  );
                })}
              </svg>
            </div>

            {/* Main chart */}
            {data && (
              <CandlestickChart
                ref={candleChartRef}
                candles={data.candles}
                indicators={indicatorData}
                activeIndicators={activeIndicators}
                onCrosshairMove={bar => setLegendBar(bar)}
                onRangeChange={handleRangeChange}
                onReady={handle => { chartHandleRef.current = handle; }}
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

          {/* ATR panel */}
          {showAtr && atrData.length > 0 && (
            <IndicatorPanel
              type="atr"
              data={atrData}
              height={90}
              logicalRange={logicalRange}
              onRangeChange={handleRangeChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}
