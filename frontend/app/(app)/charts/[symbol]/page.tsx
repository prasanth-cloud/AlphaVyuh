"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { BookmarkPlus, Save } from "lucide-react";
import type { LogicalRange } from "lightweight-charts";
import type {
  CandlesResponse, Drawing, Fundamentals, OrderResult, PriceAlert,
} from "@/lib/api";
import {
  getCandles, getCandlesLive, getIndicators, getDrawings, saveDrawing,
  getChartLayout, saveChartLayout, getWatchlists, addToWatchlist,
  getFundamentals, getPlanStatus, getQuote, getBrokerStatus,
  getPriceAlerts, createPriceAlert, deletePriceAlert,
} from "@/lib/api";
import SymbolSearch from "@/components/charts/SymbolSearch";
import OrderModal from "@/components/charts/OrderModal";
import type { IndicatorData, IchimokuPoint, ChartHandle } from "@/components/charts/CandlestickChart";

type LinePoint = { time: string; value: number };
type MACDPoint = { time: string; macd: number | null; signal: number | null; histogram: number | null };
type StochPoint = { time: string; k: number; d: number | null };

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
  { ssr: false, loading: () => <div className="animate-pulse h-full w-full" style={{ background: "var(--app-surface3)" }} /> }
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
  const [liveMode, setLiveMode] = useState(false);

  const [data, setData] = useState<CandlesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Compare symbol
  const [compareSymbol, setCompareSymbol] = useState("");
  const [compareInput, setCompareInput] = useState("");
  const [showCompareInput, setShowCompareInput] = useState(false);
  const [compareData, setCompareData] = useState<CandlesResponse | null>(null);

  // Price alerts
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);
  const [alertCondition, setAlertCondition] = useState<"above" | "below">("above");
  const [alertPrice, setAlertPrice] = useState("");
  const [alertNote, setAlertNote] = useState("");
  const [alertSaving, setAlertSaving] = useState(false);
  const [alertMsg, setAlertMsg] = useState("");

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

  // Load compare symbol data
  useEffect(() => {
    if (!compareSymbol) { setCompareData(null); return; }
    const limit = timeframe === "D" ? 500 : timeframe === "W" ? 260 : 120;
    getCandles(compareSymbol, { limit, timeframe }).then(setCompareData).catch(() => setCompareData(null));
  }, [compareSymbol, timeframe]);

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
    const fetcher = liveMode
      ? getCandlesLive(symbol, { limit, timeframe })
      : getCandles(symbol, { limit, timeframe });

    fetcher
      .then(d => { setData(d); setLegendBar(null); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [symbol, timeframe, liveMode]);

  // Auto-refresh every 5 minutes in live mode
  useEffect(() => {
    if (!liveMode) return;
    const interval = setInterval(() => {
      const limit = timeframe === "D" ? 500 : timeframe === "W" ? 260 : 120;
      getCandlesLive(symbol, { limit, timeframe })
        .then(d => { setData(d); setLegendBar(null); })
        .catch(() => {});
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [liveMode, symbol, timeframe]);

  // Load saved layout + plan + alerts
  useEffect(() => {
    getChartLayout(symbol).then(layout => {
      if (layout.indicators?.length) setActiveIndicators(layout.indicators);
    });
    getPlanStatus().then(s => setUserPlan(s.plan)).catch(() => {});
    getQuote(symbol).then(q => { if (q?.currency) setSymbolCurrency(q.currency); }).catch(() => {});
    getBrokerStatus().then(s => setBrokerConnected(s.connected)).catch(() => {});
    getPriceAlerts().then(alerts => setPriceAlerts(alerts.filter(a => a.symbol === symbol && a.is_active))).catch(() => {});
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

  async function handleCreateAlert() {
    const price = parseFloat(alertPrice);
    if (!price || price <= 0) { setAlertMsg("Enter a valid price"); return; }
    setAlertSaving(true);
    try {
      const created = await createPriceAlert({ symbol, condition: alertCondition, target_price: price, note: alertNote || undefined });
      setPriceAlerts(prev => [created, ...prev]);
      setAlertMsg("Alert set!");
      setAlertPrice("");
      setAlertNote("");
      setTimeout(() => { setAlertMsg(""); setShowAlertModal(false); }, 1500);
    } catch (e: unknown) {
      setAlertMsg(e instanceof Error ? e.message : "Failed");
    }
    setAlertSaving(false);
  }

  async function handleDeleteAlert(id: string) {
    await deletePriceAlert(id).catch(() => {});
    setPriceAlerts(prev => prev.filter(a => a.id !== id));
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

  // Stale data warning: show if last candle is > 1 trading day old
  const lastCandleDate = data?.candles?.at(-1)?.time ?? null;
  const dataAgeDays = lastCandleDate
    ? Math.floor((Date.now() - new Date(lastCandleDate).getTime()) / 86400000)
    : null;
  // Don't show stale warning in live mode or on weekends that are expected
  const showStaleWarning = !liveMode && dataAgeDays != null && dataAgeDays > 2;
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
    <div className="flex flex-col overflow-hidden" style={{ height: "calc(100vh - 48px)", background: "var(--app-bg)" }}>

      {/* Price alert modal */}
      {showAlertModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAlertModal(false)} />
          <div className="relative rounded-[12px] shadow-2xl p-5 w-[340px]"
            style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[14px] font-semibold" style={{ color: "var(--app-text1)" }}>Price alert — {symbol}</span>
              <button onClick={() => setShowAlertModal(false)} className="text-[18px] leading-none transition-colors"
                style={{ color: "var(--app-text3)" }}>×</button>
            </div>

            {/* Existing alerts */}
            {priceAlerts.length > 0 && (
              <div className="mb-4 space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--app-text3)" }}>Active alerts</div>
                {priceAlerts.map(a => (
                  <div key={a.id} className="flex items-center justify-between rounded-[6px] px-3 py-2"
                    style={{ background: "var(--app-surface3)" }}>
                    <span className="text-[12px]" style={{ color: "var(--app-text1)" }}>
                      {a.condition === "above" ? "↑ Above" : "↓ Below"} ₹{Number(a.target_price).toLocaleString("en-IN")}
                    </span>
                    <button onClick={() => handleDeleteAlert(a.id)} className="text-[11px] hover:font-semibold"
                      style={{ color: "var(--app-loss)" }}>Remove</button>
                  </div>
                ))}
              </div>
            )}

            {/* New alert form */}
            <div className="space-y-3">
              <div className="flex gap-2">
                {(["above", "below"] as const).map(c => (
                  <button key={c} onClick={() => setAlertCondition(c)}
                    className="flex-1 py-1.5 text-[12px] font-semibold rounded-[6px] transition-colors capitalize"
                    style={alertCondition === c
                      ? { background: c === "above" ? "rgba(38,166,91,0.15)" : "rgba(229,56,59,0.15)", color: c === "above" ? "#26a65b" : "#e5383b", border: `1px solid ${c === "above" ? "rgba(38,166,91,0.3)" : "rgba(229,56,59,0.3)"}` }
                      : { background: "var(--app-surface3)", color: "var(--app-text3)", border: "1px solid var(--app-border)" }}
                  >
                    {c === "above" ? "↑ Above" : "↓ Below"}
                  </button>
                ))}
              </div>
              <input
                type="number"
                value={alertPrice}
                onChange={e => setAlertPrice(e.target.value)}
                placeholder={`Target price${latest?.close ? ` (current ₹${latest.close.toFixed(2)})` : ""}`}
                className="w-full rounded-[7px] px-3 py-2 text-[13px] outline-none"
                style={{ background: "var(--app-surface3)", border: "1px solid var(--app-border)", color: "var(--app-text1)" }}
              />
              <input
                type="text"
                value={alertNote}
                onChange={e => setAlertNote(e.target.value)}
                placeholder="Note (optional)"
                className="w-full rounded-[7px] px-3 py-2 text-[13px] outline-none"
                style={{ background: "var(--app-surface3)", border: "1px solid var(--app-border)", color: "var(--app-text1)" }}
              />
              {alertMsg && (
                <div className="text-[12px] font-medium" style={{ color: alertMsg === "Alert set!" ? "#26a65b" : "#e5383b" }}>{alertMsg}</div>
              )}
              <button
                onClick={handleCreateAlert}
                disabled={alertSaving}
                className="w-full py-2 text-[13px] font-semibold rounded-[8px] hover:opacity-90 disabled:opacity-50 transition-opacity"
                style={{ background: "var(--app-teal)", color: "#0D0F14" }}
              >
                {alertSaving ? "Saving…" : "Set alert"}
              </button>
            </div>
          </div>
        </div>
      )}

      {planUpgradeToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#1c1c1a] text-white text-[13px] px-4 py-2 rounded-lg shadow-lg pointer-events-none flex items-center gap-2">
          <span>{planUpgradeToast}</span>
          <a href="/settings/billing" className="underline text-[#a5aaff] text-[12px] pointer-events-auto">Upgrade →</a>
        </div>
      )}

      {/* Stale data banner */}
      {showStaleWarning && (
        <div className="flex items-center gap-2 px-4 py-1.5 text-[11px] text-[#d97706] flex-shrink-0"
          style={{ background: "rgba(217,119,6,0.08)", borderBottom: "1px solid rgba(217,119,6,0.2)" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          Data is {dataAgeDays} days old — bhavcopy may not have run.
          <button onClick={() => setLiveMode(true)} className="underline font-semibold hover:no-underline">Switch to live data</button>
        </div>
      )}

      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 gap-4 flex-shrink-0"
        style={{ background: "var(--app-surface)", borderBottom: "1px solid var(--app-border)" }}>
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
          <div className="flex items-center gap-0.5 mr-1 rounded-[6px] p-0.5" style={{ background: "var(--app-surface3)" }}>
            {(["D", "W", "M"] as const).map(tf => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className="text-[11px] px-2.5 py-1 rounded-[4px] font-semibold transition-colors"
                style={timeframe === tf
                  ? { background: "var(--app-teal)", color: "#0D0F14" }
                  : { background: "transparent", color: "var(--app-text3)" }
                }
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Separator */}
          <div className="w-px h-5" style={{ background: "var(--app-border)" }} />

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
                  ? { background: ind.color + "22", color: ind.color, border: `1px solid ${ind.color}44` }
                  : locked
                    ? { background: "var(--app-surface3)", color: "var(--app-text3)", border: "1px solid var(--app-border)" }
                    : { background: "var(--app-surface3)", color: "var(--app-text3)", border: "1px solid var(--app-border)" }
                }
              >
                {locked && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><rect x="1.5" y="3.5" width="5" height="4" rx="0.5" fill="currentColor"/><path d="M2.5 3.5V2.5a1.5 1.5 0 013 0v1" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>}
                {ind.label}
              </button>
            );
          })}

          {/* Separator */}
          <div className="w-px h-5" style={{ background: "var(--app-border)" }} />

          {/* Drawing tools */}
          {DRAWING_TOOLS.map(tool => (
            <button
              key={tool}
              onClick={() => setActiveDrawingTool(t => t === tool ? null : tool)}
              className="text-[11px] px-2.5 py-1 rounded-[4px] font-medium transition-colors"
              style={activeDrawingTool === tool
                ? { background: "rgba(91,99,245,0.2)", color: "#818cf8", border: "1px solid rgba(91,99,245,0.4)" }
                : { background: "var(--app-surface3)", color: "var(--app-text3)", border: "1px solid var(--app-border)" }
              }
            >
              {tool}
            </button>
          ))}

          {/* Clear drawings */}
          {drawnLines.length > 0 && (
            <button
              onClick={clearDrawings}
              className="text-[11px] px-2.5 py-1 rounded-[4px] transition-colors"
              style={{ border: "1px solid var(--app-border)", color: "var(--app-loss)" }}
            >
              Clear
            </button>
          )}

          {/* Compare symbol */}
          <div className="relative">
            {showCompareInput ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={compareInput}
                  onChange={e => setCompareInput(e.target.value.toUpperCase())}
                  onKeyDown={e => {
                    if (e.key === "Enter" && compareInput.trim()) {
                      setCompareSymbol(compareInput.trim());
                      setShowCompareInput(false);
                    }
                    if (e.key === "Escape") { setShowCompareInput(false); setCompareInput(""); }
                  }}
                  placeholder="Symbol…"
                  className="text-[11px] px-2 py-1 rounded-[4px] outline-none w-[80px]"
                  style={{ border: "1px solid var(--app-teal)", background: "var(--app-surface3)", color: "var(--app-text1)" }}
                />
                <button onClick={() => { setShowCompareInput(false); setCompareInput(""); }}
                  className="text-[14px] leading-none transition-colors"
                  style={{ color: "var(--app-text3)" }}>×</button>
              </div>
            ) : compareSymbol ? (
              <div className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-[4px] font-semibold"
                style={{ background: "rgba(0,229,196,0.1)", border: "1px solid rgba(0,229,196,0.3)", color: "var(--app-teal)" }}>
                vs {compareSymbol}
                <button onClick={() => { setCompareSymbol(""); setCompareData(null); }} className="ml-0.5 hover:text-[#e5383b] transition-colors">×</button>
              </div>
            ) : (
              <button
                onClick={() => setShowCompareInput(true)}
                className="text-[11px] px-2.5 py-1 rounded-[4px] border border-[#e8e8e6] text-[#888] hover:border-[#5b63f5] hover:text-[#5b63f5] transition-colors"
                title="Compare with another symbol"
              >
                Compare
              </button>
            )}
          </div>

          {/* Live data toggle */}
          <button
            onClick={() => setLiveMode(m => !m)}
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-[4px] font-semibold transition-colors"
            style={liveMode
              ? { background: "rgba(38,166,91,0.15)", color: "#26a65b", border: "1px solid rgba(38,166,91,0.3)" }
              : { background: "var(--app-surface3)", color: "var(--app-text3)", border: "1px solid var(--app-border)" }}
            title={liveMode ? "Live data (Yahoo Finance) — refresh every 5 min" : "Switch to live Yahoo Finance data"}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${liveMode ? "bg-[#26a65b] animate-pulse" : ""}`}
              style={!liveMode ? { background: "var(--app-text3)" } : {}} />
            {liveMode ? "Live" : "EOD"}
          </button>

          {/* Price alert bell */}
          <button
            onClick={() => { setShowAlertModal(m => !m); setAlertMsg(""); }}
            className="relative flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-[4px] transition-colors"
            style={priceAlerts.length > 0
              ? { background: "rgba(217,119,6,0.15)", color: "#d97706", border: "1px solid rgba(217,119,6,0.3)" }
              : { background: "var(--app-surface3)", color: "var(--app-text3)", border: "1px solid var(--app-border)" }}
            title="Price alerts"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            {priceAlerts.length > 0 && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#d97706] text-white text-[8px] flex items-center justify-center font-bold">
                {priceAlerts.length}
              </span>
            )}
          </button>

          {/* Save layout */}
          <button
            onClick={handleSaveLayout}
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-[4px] transition-colors"
            style={{ background: "var(--app-surface3)", color: "var(--app-text3)", border: "1px solid var(--app-border)" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--app-teal)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--app-teal)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--app-text3)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--app-border)"; }}
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
        <aside className="w-[240px] flex-shrink-0 flex flex-col overflow-y-auto"
          style={{ background: "var(--app-surface)", borderRight: "1px solid var(--app-border)" }}>
          {loading ? (
            <div className="p-4 space-y-3">
              {[80, 50, 60, 40, 70].map((w, i) => (
                <div key={i} className="h-3 rounded animate-pulse" style={{ background: "var(--app-surface3)", width: `${w}%` }} />
              ))}
            </div>
          ) : error ? (
            <div className="p-4 text-[12px]" style={{ color: "var(--app-loss)" }}>{error}</div>
          ) : data && (
            <>
              {/* Symbol header */}
              <div className="p-4" style={{ borderBottom: "1px solid var(--app-border)" }}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[18px] font-bold tracking-[-0.5px]" style={{ color: "var(--app-text1)" }}>{symbol}</span>
                  {data.sector && (
                    <span className="text-[10px] rounded-full px-2 py-0.5 truncate max-w-[90px]"
                      style={{ border: "1px solid var(--app-border)", color: "var(--app-text3)" }}>
                      {data.sector}
                    </span>
                  )}
                </div>
                <div className="text-[11px] leading-tight truncate" style={{ color: "var(--app-text3)" }}>{data.company_name}</div>

                <div className="mt-2">
                  <div className="text-[22px] font-bold tracking-[-0.8px] tabular-nums" style={{ color: "var(--app-text1)" }}>
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
                    <div className="rounded-[7px] overflow-hidden" style={{ border: "1px solid var(--app-border)" }}>
                      <div className="px-3 py-2 text-[11px]" style={{ background: "var(--app-surface3)", color: "var(--app-text3)" }}>Pick a watchlist</div>
                      {watchlists.map(wl => (
                        <button key={wl.id} onClick={() => handlePickWl(wl.id)}
                          className="w-full text-left px-3 py-2 text-[12px] transition-colors"
                          style={{ color: "var(--app-text1)", borderTop: "1px solid var(--app-border2)" }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--app-surface3)"}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                          {wl.name}
                        </button>
                      ))}
                      <button onClick={() => setShowWlPicker(false)}
                        className="w-full text-left px-3 py-2 text-[12px] transition-colors"
                        style={{ color: "var(--app-text3)", borderTop: "1px solid var(--app-border2)" }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--app-surface3)"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button onClick={handleAddWatchlist}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-[7px] text-[11px] transition-colors"
                      style={{ border: "1px solid var(--app-border)", color: "var(--app-text2)" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--app-teal)"; (e.currentTarget as HTMLElement).style.color = "var(--app-teal)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--app-border)"; (e.currentTarget as HTMLElement).style.color = "var(--app-text2)"; }}>
                      <BookmarkPlus size={12} /> Add to watchlist
                    </button>
                  )}
                </div>
              </div>

              {/* Buy / Sell */}
              <div className="px-4 py-3 flex gap-2" style={{ borderBottom: "1px solid var(--app-border)" }}>
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
              <div style={{ borderBottom: "1px solid var(--app-border)" }}>
                <button
                  onClick={() => setShowTechnicals(t => !t)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors"
                  style={{ color: "var(--app-text2)" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--app-surface2)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                >
                  <span className="text-[10px] uppercase tracking-[0.5px] font-semibold" style={{ color: "var(--app-text3)" }}>Technicals</span>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                    className="transition-transform flex-shrink-0"
                    style={{ transform: showTechnicals ? "rotate(180deg)" : "rotate(0deg)" }}>
                    <path d="M2 4l4 4 4-4" stroke="var(--app-text3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {showTechnicals && (
                  <div className="px-4 pb-4 space-y-4">
                    {/* OHLCV */}
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.5px] mb-1.5 font-semibold" style={{ color: "var(--app-text3)" }}>OHLCV</div>
                      <div className="space-y-1">
                        {([
                          ["Open",   fmtPrice(latest?.open,  symbolCurrency)],
                          ["High",   fmtPrice(latest?.high,  symbolCurrency)],
                          ["Low",    fmtPrice(latest?.low,   symbolCurrency)],
                          ["Close",  fmtPrice(latest?.close, symbolCurrency)],
                          ["Volume", latest?.volume ? fmtVol(latest.volume) : "—"],
                        ] as [string, string][]).map(([label, val]) => (
                          <div key={label} className="flex items-center justify-between">
                            <span className="text-[11px]" style={{ color: "var(--app-text3)" }}>{label}</span>
                            <span className="text-[11px] font-medium tabular-nums" style={{ color: "var(--app-text1)" }}>{val}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Key metrics */}
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.5px] mb-1.5 font-semibold" style={{ color: "var(--app-text3)" }}>Momentum</div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px]" style={{ color: "var(--app-text3)" }}>RSI 14</span>
                          {latest?.rsi_14 != null ? (
                            <span className="text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full"
                              style={{
                                background: latest.rsi_14 > 70 ? "rgba(91,99,245,0.2)" : latest.rsi_14 < 40 ? "rgba(217,119,6,0.2)" : "rgba(38,166,91,0.2)",
                                color: latest.rsi_14 > 70 ? "#818cf8" : latest.rsi_14 < 40 ? "#d97706" : "#26a65b",
                              }}>
                              {latest.rsi_14.toFixed(1)}
                            </span>
                          ) : <span className="text-[11px]" style={{ color: "var(--app-text3)" }}>—</span>}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px]" style={{ color: "var(--app-text3)" }}>Vol Ratio</span>
                          <span className="text-[11px] font-medium tabular-nums" style={{ color: "#7c6af0" }}>
                            {latest?.volume_ratio != null ? `${latest.volume_ratio.toFixed(2)}x` : "—"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px]" style={{ color: "var(--app-text3)" }}>ATR 14</span>
                          <span className="text-[11px] font-medium tabular-nums" style={{ color: "var(--app-text1)" }}>
                            {latest?.atr_14 != null ? fmtPrice(latest.atr_14, symbolCurrency) : "—"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* EMA stack */}
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.5px] mb-1.5 font-semibold" style={{ color: "var(--app-text3)" }}>EMA Levels</div>
                      <div className="space-y-1">
                        {([
                          ["EMA 20",  latest?.ema_20,  "#00E5C4"],
                          ["EMA 50",  latest?.ema_50,  "#818cf8"],
                          ["EMA 200", latest?.ema_200, "#f59e0b"],
                        ] as [string, number | null | undefined, string][]).map(([label, ema, color]) => {
                          const above = ema != null && latest?.close != null && latest.close > ema;
                          return (
                            <div key={label} className="flex items-center justify-between">
                              <div className="flex items-center gap-1">
                                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                                <span className="text-[11px]" style={{ color: "var(--app-text3)" }}>{label}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] tabular-nums" style={{ color: "var(--app-text2)" }}>{fmtPrice(ema, symbolCurrency)}</span>
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
                        <div className="text-[9px] uppercase tracking-[0.5px] mb-1.5 font-semibold" style={{ color: "var(--app-text3)" }}>52-Week Range</div>
                        <div className="relative h-[3px] rounded-full mx-0.5 my-2.5" style={{ background: "var(--app-surface3)" }}>
                          <div className="absolute h-[3px] rounded-full" style={{ width: `${Math.min(100, Math.max(0, w52pct ?? 0))}%`, background: "var(--app-teal)" }} />
                          <div className="absolute w-2.5 h-2.5 rounded-full -translate-y-[35%] -translate-x-1/2"
                            style={{ left: `${Math.min(100, Math.max(0, w52pct ?? 0))}%`, background: "var(--app-text1)", border: "2px solid var(--app-bg)" }} />
                        </div>
                        <div className="flex justify-between text-[10px] tabular-nums" style={{ color: "var(--app-text3)" }}>
                          <span>{fmtPrice(latest.week_52_low,  symbolCurrency)}</span>
                          <span>{fmtPrice(latest.week_52_high, symbolCurrency)}</span>
                        </div>
                        {pctFrom52H != null && (
                          <div className="text-[10px] text-center mt-0.5" style={{ color: "var(--app-text3)" }}>
                            {pctFrom52H.toFixed(1)}% from 52W high
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Fundamentals accordion ───────────────────────────── */}
              <div style={{ borderBottom: "1px solid var(--app-border)" }}>
                <button
                  onClick={() => setShowFundamentals(f => !f)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors"
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--app-surface2)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                >
                  <span className="text-[10px] uppercase tracking-[0.5px] font-semibold" style={{ color: "var(--app-text3)" }}>Fundamentals</span>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                    className="transition-transform flex-shrink-0"
                    style={{ transform: showFundamentals ? "rotate(180deg)" : "rotate(0deg)" }}>
                    <path d="M2 4l4 4 4-4" stroke="var(--app-text3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {showFundamentals && (
                  <div className="px-4 pb-4">
                    {!fundamentals ? (
                      <div className="space-y-1.5">
                        {[1,2,3,4,5].map(i => (
                          <div key={i} className="h-3 rounded animate-pulse" style={{ background: "var(--app-surface3)" }} />
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
                            <span className="text-[11px]" style={{ color: "var(--app-text3)" }}>{label}</span>
                            <span className="text-[11px] font-medium tabular-nums" style={{ color: "var(--app-text1)" }}>{val}</span>
                          </div>
                        ))}
                        <div className="text-[9px] mt-1" style={{ color: "var(--app-text3)" }}>Source: Yahoo Finance</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {/* ── Broker connect panel ────────────────────────────── */}
              {!brokerConnected && (
                <div className="p-4" style={{ borderTop: "1px solid var(--app-border)" }}>
                  <div className="text-[10px] uppercase tracking-[0.5px] mb-2 font-semibold" style={{ color: "var(--app-text3)" }}>Quick order</div>
                  <div className="rounded-[8px] p-3 text-center" style={{ background: "rgba(0,229,196,0.08)", border: "1px solid rgba(0,229,196,0.2)" }}>
                    <div className="text-[12px] font-semibold mb-0.5" style={{ color: "var(--app-teal)" }}>Connect your broker</div>
                    <div className="text-[11px] mb-2.5" style={{ color: "var(--app-text2)" }}>Trade directly from the chart</div>
                    <Link
                      href="/settings?tab=profile"
                      className="inline-block text-[11px] font-semibold px-3 py-1.5 rounded-[6px] hover:opacity-85 transition-opacity"
                      style={{ background: "var(--app-teal)", color: "#0D0F14" }}
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
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ background: "var(--app-bg)" }}>
          {/* OHLCV legend / crosshair overlay */}
          <div className="relative flex-1 min-h-0">
            {/* Candle legend */}
            {displayBar && (
              <div className="absolute top-2 left-3 z-10 pointer-events-none rounded px-2 py-1 text-[11px] font-mono"
                style={{ background: "rgba(13,15,20,0.8)", color: "rgba(255,255,255,0.4)" }}>
                <span className="font-semibold mr-2" style={{ color: "rgba(255,255,255,0.9)" }}>{symbol}</span>
                <span className="mr-3">{displayBar.time}</span>
                <span className="mr-2">O <span style={{ color: "rgba(255,255,255,0.85)" }}>{displayBar.open?.toFixed(2)}</span></span>
                <span className="mr-2">H <span style={{ color: "rgba(255,255,255,0.85)" }}>{displayBar.high?.toFixed(2)}</span></span>
                <span className="mr-2">L <span style={{ color: "rgba(255,255,255,0.85)" }}>{displayBar.low?.toFixed(2)}</span></span>
                <span className="mr-2">C <span style={{ color: displayBar.close >= displayBar.open ? "#26a65b" : "#e5383b" }}>{displayBar.close?.toFixed(2)}</span></span>
                <span>Vol <span style={{ color: "rgba(255,255,255,0.85)" }}>{fmtVol(displayBar.volume)}</span></span>
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

            {/* Compare overlay: price-normalised SVG chart */}
            {compareData && compareData.candles.length > 1 && data && data.candles.length > 1 && (() => {
              const base1 = data.candles[0].close;
              const base2 = compareData.candles[0].close;
              const sym1Pct = data.candles.map(c => ((c.close - base1) / base1) * 100);
              const sym2Pct = compareData.candles.map(c => ((c.close - base2) / base2) * 100);
              const allPcts = [...sym1Pct, ...sym2Pct];
              const minPct = Math.min(...allPcts);
              const maxPct = Math.max(...allPcts);
              const range = maxPct - minPct || 1;
              const H = 80;
              const toY = (pct: number) => H - ((pct - minPct) / range) * (H - 4) - 2;
              const toX = (i: number, len: number) => ((i / (len - 1)) * 100).toFixed(2);
              const mkPath = (arr: number[]) => arr.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i, arr.length)},${toY(v).toFixed(2)}`).join(" ");
              const last1 = sym1Pct.at(-1) ?? 0;
              const last2 = sym2Pct.at(-1) ?? 0;
              return (
                <div className="absolute bottom-2 left-2 right-2 z-10 rounded-[8px] px-3 py-2 pointer-events-none"
                  style={{ background: "rgba(13,15,20,0.9)", border: "1px solid var(--app-border)" }}>
                  <div className="flex items-center gap-3 mb-1">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-0.5 rounded" style={{ background: "var(--app-teal)" }} />
                      <span className="text-[10px] font-semibold" style={{ color: "var(--app-teal)" }}>{symbol}</span>
                      <span className="text-[10px] tabular-nums" style={{ color: last1 >= 0 ? "#26a65b" : "#e5383b" }}>
                        {last1 >= 0 ? "+" : ""}{last1.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-0.5 rounded" style={{ background: "#f59e0b" }} />
                      <span className="text-[10px] font-semibold" style={{ color: "#f59e0b" }}>{compareSymbol}</span>
                      <span className="text-[10px] tabular-nums" style={{ color: last2 >= 0 ? "#26a65b" : "#e5383b" }}>
                        {last2 >= 0 ? "+" : ""}{last2.toFixed(2)}%
                      </span>
                    </div>
                    <span className="text-[9px] ml-auto" style={{ color: "var(--app-text3)" }}>Normalised</span>
                  </div>
                  <svg viewBox={`0 0 100 ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none">
                    <path d={mkPath(sym1Pct)} fill="none" stroke="rgba(0,229,196,0.8)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
                    <path d={mkPath(sym2Pct)} fill="none" stroke="rgba(245,158,11,0.8)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
                    <line x1="0" y1={toY(0).toFixed(2)} x2="100" y2={toY(0).toFixed(2)} stroke="rgba(255,255,255,0.1)" strokeWidth="0.3" vectorEffect="non-scaling-stroke" strokeDasharray="2 2" />
                  </svg>
                </div>
              );
            })()}
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
