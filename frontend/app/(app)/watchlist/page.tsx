"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDownRight, ArrowUpRight, Eraser, Minus, PencilLine, Plus, Trash2, GripVertical, X, Search, Pin, PinOff, Tag, Undo2 } from "lucide-react";
import dynamic from "next/dynamic";
import type { Watchlist, WatchlistItem, CandleBar, JournalEntry, Drawing } from "@/lib/api";
import {
  getWatchlists,
  getJournalEntries,
  createWatchlist,
  deleteWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  reorderWatchlist,
  updateWatchlistItemMetadata,
  getQuote,
  searchSymbols,
  getCandles,
  getDrawings,
  saveDrawing,
  deleteDrawing,
  placeOrder,
  getQuoteLive,
  streamLiveQuotes,
  isMockMode,
  liveQuotePollingEnabled,
  type PlaceOrderRequest,
  type WatchlistItemMetadataUpdate,
} from "@/lib/api";
import type { SymbolSearchResult } from "@/lib/api";
import { EmptyState } from "@/components/ui";
import {
  createDraftPlan,
  isTradePlanValid,
  SYMBOL_LIFECYCLE,
  useWorkflowState,
  type SymbolLifecycle,
  type TradePlan,
} from "@/lib/workflow";

type ChartDisplayType = "candles" | "bars" | "line";
type SetupSignal = { label: string; tone: "gain" | "loss" | "accent" | "neutral"; score: number };
type WatchlistDrawingTool = "trendline" | "horizontal" | "long" | "short";
type WatchlistDrawingPoint = { time: string; price: number };
type WatchlistOverlayDrawing = {
  id: string;
  tool: WatchlistDrawingTool;
  p1: WatchlistDrawingPoint;
  p2?: WatchlistDrawingPoint;
  color: string;
};

const MiniChart = dynamic(() => import("@/components/charts/MiniChart"), { ssr: false });
const STARTER_SYMBOLS = ["RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK", "TATAMOTORS"];
const WATCHLIST_PAGE_SIZE = 5;

function getSetupSignal(item: WatchlistItem): SetupSignal {
  const move = item.pct_change ?? 0;
  const volume = item.volume_ratio ?? 0;
  const rsi = item.rsi_14 ?? 50;

  if (move >= 2 && volume >= 1.5 && rsi >= 58) return { label: "Breakout", tone: "gain", score: 95 };
  if (move >= 0.5 && volume >= 1.2 && rsi >= 55) return { label: "Momentum", tone: "accent", score: 82 };
  if (move <= -2 && volume >= 1.3) return { label: "Weak", tone: "loss", score: 28 };
  if (move > -1 && move < 1 && rsi >= 42 && rsi <= 58) return { label: "Pullback", tone: "neutral", score: 64 };
  return { label: "Watch", tone: "neutral", score: 50 };
}

function setupToneColor(tone: SetupSignal["tone"]) {
  if (tone === "gain") return "var(--gain)";
  if (tone === "loss") return "var(--loss)";
  if (tone === "accent") return "var(--accent)";
  return "var(--text-secondary)";
}

function formatCompactVolume(value: number): string {
  if (value >= 10_000_000) return `${(value / 10_000_000).toFixed(1)}Cr`;
  if (value >= 100_000) return `${(value / 100_000).toFixed(1)}L`;
  return value.toLocaleString("en-IN");
}

function formatNullablePrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Sortable row ─────────────────────────────────────────────────────────────

function SortableRow({
  item,
  isSelected,
  pinned,
  reviewState,
  onRemove,
  onSelect,
  onOpenChart,
  dense,
}: {
  item: WatchlistItem;
  isSelected: boolean;
  pinned: boolean;
  reviewState?: "reviewed" | "needs-review" | "new";
  onRemove: (symbol: string) => void;
  onSelect: (symbol: string) => void;
  onOpenChart: (symbol: string) => void;
  dense: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.symbol });
  const priceTone = (item.pct_change ?? 0) >= 0 ? "var(--gain)" : "var(--loss)";
  const setup = getSetupSignal(item);
  const setupColor = setupToneColor(setup.tone);

  return (
    <tr
      ref={setNodeRef}
      data-symbol={item.symbol}
      data-pinned={pinned ? "true" : "false"}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        background: isSelected ? "linear-gradient(90deg, rgba(77,214,255,0.15), rgba(255,255,255,0.015))" : "transparent",
        borderLeft: `2px solid ${isSelected ? "var(--accent)" : "transparent"}`,
        cursor: "pointer",
      }}
      className="watchlist-row"
      tabIndex={0}
      onClick={() => onSelect(item.symbol)}
      onDoubleClick={() => onOpenChart(item.symbol)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onOpenChart(item.symbol);
        }
        if (e.key === " ") {
          e.preventDefault();
          onSelect(item.symbol);
        }
      }}
    >
      <td style={{ padding: dense ? "5px 8px 5px 6px" : "7px 10px 7px 8px", width: 24 }} onClick={e => e.stopPropagation()}>
        <button
          {...attributes}
          {...listeners}
          style={{ color: "var(--text-tertiary)", cursor: "grab", lineHeight: 0 }}
        >
          <GripVertical size={13} />
        </button>
      </td>
      <td style={{ padding: dense ? "5px 8px" : "7px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {pinned && (
            <span style={{ color: "var(--accent)", lineHeight: 0 }} title="Pinned to top of queue">
              <Pin size={11} />
            </span>
          )}
          <div className="mono" style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.02em" }}>{item.symbol}</div>
          {item.sector && !dense && (
            <span style={{ fontSize: 10, color: "var(--text-tertiary)", padding: "2px 6px", borderRadius: 999, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              {item.sector}
            </span>
          )}
          <span
            title={`Setup score ${setup.score}`}
            style={{
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: setupColor,
              padding: "2px 6px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.035)",
              border: `1px solid ${setupColor}`,
            }}
          >
            {setup.label}
          </span>
        </div>
        {item.company_name && (
          <div className="caption" style={{ maxWidth: dense ? 160 : 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: dense ? 0 : 2, fontSize: dense ? 10 : 11 }}>
            {item.company_name}
          </div>
        )}
        {(!dense && reviewState) && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
            {reviewState && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.03em",
                  textTransform: "uppercase",
                  color: reviewState === "reviewed" ? "#4ade80" : reviewState === "needs-review" ? "#fbbf24" : "#94a3b8",
                }}
              >
                {reviewState === "reviewed" ? "Reviewed" : reviewState === "needs-review" ? "Needs review" : "New"}
              </span>
            )}
          </div>
        )}
      </td>
      <td style={{ padding: dense ? "5px 8px" : "7px 10px", textAlign: "right" }}>
        <div className="mono" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
          {item.close != null ? `₹${item.close.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}
        </div>
        <div className="mono" style={{
          fontSize: 11, fontWeight: 700,
          color: priceTone,
        }}>
          {item.pct_change != null ? `${item.pct_change >= 0 ? "+" : ""}${item.pct_change.toFixed(2)}%` : "—"}
        </div>
      </td>
      <td style={{ padding: dense ? "5px 6px" : "7px 6px", textAlign: "right" }}>
        <div className="mono" style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>
          {item.rsi_14 != null ? `RSI ${item.rsi_14.toFixed(0)}` : "—"}
        </div>
        <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
          {item.volume_ratio != null ? `${item.volume_ratio.toFixed(2)}× vol` : ""}
        </div>
      </td>
      <td style={{ padding: dense ? "5px 6px 5px 4px" : "7px 8px 7px 4px", textAlign: "right", width: 24 }} onClick={e => e.stopPropagation()}>
        <button
          onClick={() => onRemove(item.symbol)}
          style={{ color: "var(--text-tertiary)", lineHeight: 0, opacity: 0 }}
          className="remove-btn"
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--loss)"}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"}
        >
          <Trash2 size={12} />
        </button>
      </td>
    </tr>
  );
}

// ─── Timeframe tabs ───────────────────────────────────────────────────────────

function TimeframeTabs({ active, onChange }: { active: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", background: "var(--surface-2)", borderRadius: "var(--radius-sm)", padding: 2 }}>
      {["1D", "1W", "1M", "3M", "6M", "1Y", "3Y", "5Y", "10Y"].map(tf => (
        <button key={tf} onClick={() => onChange(tf)} style={{
          padding: "3px 10px",
          fontSize: 11, fontWeight: 500,
          color: active === tf ? "var(--text-primary)" : "var(--text-tertiary)",
          background: active === tf ? "var(--surface-3)" : "transparent",
          border: "none", borderRadius: "var(--radius-sm)",
          cursor: "pointer",
          transition: "all var(--motion-instant) var(--ease-out)",
        }}>{tf}</button>
      ))}
    </div>
  );
}

function normalizeWatchlistDrawing(drawing: Drawing): WatchlistOverlayDrawing | null {
  const toolType = String(drawing.tool_type || "").toLowerCase();
  const tool: WatchlistDrawingTool | null =
    toolType === "trendline" ? "trendline" :
    toolType === "horizontal" ? "horizontal" :
    toolType === "long" ? "long" :
    toolType === "short" ? "short" :
    null;
  if (!tool) return null;
  const points = drawing.points as Array<{ time?: string; price?: number }>;
  const first = points[0];
  if (!first?.time || first.price == null) return null;
  const second = points[1];
  return {
    id: drawing.id,
    tool,
    p1: { time: first.time, price: first.price },
    p2: second?.time && second.price != null ? { time: second.time, price: second.price } : undefined,
    color: (drawing.style as { color?: string })?.color ?? (tool === "short" ? "#e5383b" : tool === "long" ? "#1bbf72" : "#f4f7fb"),
  };
}

// ─── Chart + order panel ──────────────────────────────────────────────────────

function ChartPanel({
  symbol,
  latestClose,
  watchlistName,
  planValid,
  plan,
  planSummary,
  onOpenPlan,
  onOpenChart,
  onStepSymbol,
}: {
  symbol: string;
  latestClose?: number | null;
  watchlistName?: string | null;
  planValid: boolean;
  plan: TradePlan | null;
  planSummary?: string;
  onOpenPlan: () => void;
  onOpenChart: (symbol: string) => void;
  onStepSymbol: (direction: "prev" | "next") => void;
}) {
  const chartWrapRef = useRef<HTMLDivElement | null>(null);
  const [candles, setCandles] = useState<CandleBar[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [tf, setTf] = useState("3M");
  const [chartType, setChartType] = useState<ChartDisplayType>("candles");
  const [showChartDetails, setShowChartDetails] = useState(false);
  const [showOrderTicket, setShowOrderTicket] = useState(false);
  const [activeTool, setActiveTool] = useState<WatchlistDrawingTool | null>(null);
  const [drawings, setDrawings] = useState<WatchlistOverlayDrawing[]>([]);
  const [pendingPoint, setPendingPoint] = useState<WatchlistDrawingPoint | null>(null);
  const [overlaySize, setOverlaySize] = useState({ width: 0, height: 0 });
  const [toolMsg, setToolMsg] = useState("");

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [setupType, setSetupType] = useState("breakout");
  const [tradeNote, setTradeNote] = useState("");
  const [orderBusy, setOrderBusy] = useState(false);
  const [orderMsg, setOrderMsg] = useState<{ ok: boolean; text: string; journalReady?: boolean } | null>(null);
  const latestBar = candles[candles.length - 1] ?? null;
  const previousBar = candles[candles.length - 2] ?? null;
  const referenceClose = latestClose ?? latestBar?.close ?? null;
  const previewChange = latestBar && previousBar
    ? ((latestBar.close - previousBar.close) / previousBar.close) * 100
    : null;
  const estimatedValue = (() => {
    const qtyN = parseInt(qty, 10);
    const priceN = parseFloat(price || String(referenceClose ?? ""));
    if (!qtyN || !priceN) return null;
    return qtyN * priceN;
  })();

  useEffect(() => {
    if (!plan) return;
    if (plan.entry && !price) setPrice(plan.entry);
    if (plan.positionSize && qty === "1") setQty(plan.positionSize);
    if (plan.setupType) setSetupType(plan.setupType.toLowerCase());
    if (plan.thesis && !tradeNote) setTradeNote(plan.thesis);
  }, [plan, price, qty, tradeNote]);
  const chartStats = useMemo(() => {
    if (candles.length < 2) return null;
    const closes = candles.map((c) => c.close).filter((value) => Number.isFinite(value));
    const highs = candles.map((c) => c.high).filter((value) => Number.isFinite(value));
    const lows = candles.map((c) => c.low).filter((value) => Number.isFinite(value));
    const volumes = candles.map((c) => c.volume).filter((value) => Number.isFinite(value));
    if (!closes.length || !highs.length || !lows.length) return null;
    const last = candles[candles.length - 1];
    const first = candles[0];
    const high = Math.max(...highs);
    const low = Math.min(...lows);
    const avgVolume = volumes.reduce((sum, value) => sum + value, 0) / Math.max(volumes.length, 1);
    const change = first.close ? ((last.close - first.close) / first.close) * 100 : null;
    const range = low ? ((high - low) / low) * 100 : null;
    const volumeVsAvg = avgVolume ? last.volume / avgVolume : null;
    const ema20 = last.ema_20 ?? null;
    const ema50 = last.ema_50 ?? null;
    const trend =
      ema20 != null && ema50 != null
        ? last.close >= ema20 && ema20 >= ema50
          ? "Uptrend"
          : last.close <= ema20 && ema20 <= ema50
            ? "Downtrend"
            : "Mixed"
        : change != null && change > 0
          ? "Positive"
          : "Neutral";
    const latestVolume = volumes[volumes.length - 1] ?? null;
    return {
      change,
      range,
      high,
      low,
      trend,
      latestVolume,
      volumeVsAvg,
      support: low,
      resistance: high,
      sampleSize: closes.length,
    };
  }, [candles]);
  const chartHeight = showOrderTicket ? 300 : showChartDetails ? 380 : 440;
  const drawingTimeframe = useMemo(() => {
    const timeframeMap: Record<string, "D" | "W" | "M"> = {
      "1D": "D",
      "1W": "D",
      "1M": "D",
      "3M": "D",
      "6M": "W",
      "1Y": "W",
      "3Y": "W",
      "5Y": "M",
      "10Y": "M",
    };
    return timeframeMap[tf] ?? "D";
  }, [tf]);

  useEffect(() => {
    const readTheme = () => setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    readTheme();
    window.addEventListener("storage", readTheme);
    window.addEventListener("alphavyuh:theme-changed", readTheme);
    return () => {
      window.removeEventListener("storage", readTheme);
      window.removeEventListener("alphavyuh:theme-changed", readTheme);
    };
  }, []);

  const chartScale = useMemo(() => {
    if (!candles.length || overlaySize.width <= 0 || overlaySize.height <= 0) return null;
    const highs = candles.map((c) => c.high).filter(Number.isFinite);
    const lows = candles.map((c) => c.low).filter(Number.isFinite);
    if (!highs.length || !lows.length) return null;
    const rawHigh = Math.max(...highs);
    const rawLow = Math.min(...lows);
    const pad = Math.max((rawHigh - rawLow) * 0.08, rawHigh * 0.002, 1);
    const high = rawHigh + pad;
    const low = rawLow - pad;
    const range = high - low || 1;
    const indexByTime = new Map(candles.map((c, index) => [c.time, index]));
    return { high, low, range, indexByTime };
  }, [candles, overlaySize.height, overlaySize.width]);

  const pointToCoord = useCallback((point: WatchlistDrawingPoint) => {
    if (!chartScale || candles.length === 0) return null;
    const index = chartScale.indexByTime.get(point.time);
    if (index == null) return null;
    const x = candles.length === 1 ? overlaySize.width / 2 : (index / (candles.length - 1)) * overlaySize.width;
    const y = ((chartScale.high - point.price) / chartScale.range) * overlaySize.height;
    return { x, y };
  }, [candles.length, chartScale, overlaySize.height, overlaySize.width]);

  const coordToPoint = useCallback((clientX: number, clientY: number): WatchlistDrawingPoint | null => {
    const rect = chartWrapRef.current?.getBoundingClientRect();
    if (!rect || !chartScale || candles.length === 0) return null;
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    const y = Math.min(Math.max(clientY - rect.top, 0), rect.height);
    const index = candles.length === 1 ? 0 : Math.round((x / Math.max(rect.width, 1)) * (candles.length - 1));
    const candle = candles[Math.min(Math.max(index, 0), candles.length - 1)];
    const price = chartScale.high - (y / Math.max(rect.height, 1)) * chartScale.range;
    return { time: candle.time, price: Math.max(0, price) };
  }, [candles, chartScale]);

  const flashToolMsg = useCallback((message: string) => {
    setToolMsg(message);
    window.setTimeout(() => setToolMsg(""), 2500);
  }, []);

  useEffect(() => {
    setChartLoading(true);
    setChartError(false);
    setCandles([]);
    const timeframeMap: Record<string, "D" | "W" | "M"> = {
      "1D": "D",
      "1W": "W",
      "1M": "D",
      "3M": "D",
      "6M": "W",
      "1Y": "W",
      "3Y": "W",
      "5Y": "M",
      "10Y": "M",
    };
    const limitMap: Record<string, number> = {
      "1D": 60,
      "1W": 90,
      "1M": 30,
      "3M": 120,
      "6M": 180,
      "1Y": 260,
      "3Y": 180,
      "5Y": 260,
      "10Y": 520,
    };
    getCandles(symbol, { limit: limitMap[tf] ?? 120, timeframe: timeframeMap[tf] ?? "D" })
      .then(d => {
        setCandles(d.candles);
        if (d.latest?.close && !price) setPrice(String(d.latest.close));
      })
      .catch(() => setChartError(true))
      .finally(() => setChartLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tf]);

  useEffect(() => {
    if (latestClose) setPrice(String(latestClose));
  }, [latestClose]);

  useEffect(() => {
    setDrawings([]);
    setPendingPoint(null);
    getDrawings(symbol, drawingTimeframe)
      .then((list) => setDrawings(list.map(normalizeWatchlistDrawing).filter((drawing): drawing is WatchlistOverlayDrawing => Boolean(drawing))))
      .catch(() => setDrawings([]));
  }, [drawingTimeframe, symbol]);

  useEffect(() => {
    const node = chartWrapRef.current;
    if (!node) return;
    const syncSize = () => setOverlaySize({ width: node.clientWidth, height: node.clientHeight });
    syncSize();
    const observer = new ResizeObserver(syncSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, [chartHeight, candles.length]);

  async function handleChartToolClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!activeTool || chartLoading || chartError || candles.length === 0) return;
    const point = coordToPoint(event.clientX, event.clientY);
    if (!point) return;

    if (activeTool === "trendline" && !pendingPoint) {
      setPendingPoint(point);
      flashToolMsg("Select second point");
      return;
    }

    const p1 = pendingPoint ?? point;
    const p2 = activeTool === "trendline" ? point : point;
    const color = activeTool === "short" ? "#e5383b" : activeTool === "long" ? "#1bbf72" : "#f4f7fb";
    const local: WatchlistOverlayDrawing = {
      id: `local-${Date.now()}`,
      tool: activeTool,
      p1,
      p2,
      color,
    };
    setDrawings((current) => [...current, local]);
    setPendingPoint(null);
    setActiveTool(null);

    try {
      const saved = await saveDrawing(symbol, {
        tool_type: activeTool,
        points: activeTool === "trendline"
          ? [{ time: p1.time, price: p1.price }, { time: p2.time, price: p2.price }]
          : [{ time: p1.time, price: p1.price }, { time: p1.time, price: p1.price }],
        style: { color, source: "watchlist" },
        timeframe: drawingTimeframe,
      });
      const normalized = normalizeWatchlistDrawing(saved);
      if (normalized) {
        setDrawings((current) => current.map((drawing) => drawing.id === local.id ? normalized : drawing));
      }
      flashToolMsg(activeTool === "long" ? "Long marker saved" : activeTool === "short" ? "Short marker saved" : "Drawing saved");
    } catch {
      flashToolMsg("Saved locally for this session");
    }
  }

  async function clearWatchlistDrawings() {
    const current = drawings;
    setDrawings([]);
    setPendingPoint(null);
    await Promise.all(current.filter((drawing) => !drawing.id.startsWith("local-")).map((drawing) => deleteDrawing(symbol, drawing.id).catch(() => {})));
    flashToolMsg("Chart marks cleared");
  }

  async function handleOrder() {
    if (!planValid) {
      setOrderMsg({ ok: false, text: "Create a valid trade plan before drafting an order." });
      return;
    }
    const qtyN = parseInt(qty, 10);
    const priceN = parseFloat(price);
    if (!qtyN || qtyN < 1 || !priceN || priceN <= 0) {
      setOrderMsg({ ok: false, text: "Enter valid qty and price" });
      return;
    }
    setOrderBusy(true);
    setOrderMsg(null);
    try {
      const req: PlaceOrderRequest = {
        symbol,
        side,
        quantity: qtyN,
        price: priceN,
        order_type: orderType,
        source_page: "watchlist",
        source_context: watchlistName ? `${watchlistName} queue` : "Watchlist queue",
        ...(setupType ? { setup_type: setupType } : {}),
        ...(plan?.stop ? { stop_loss: Number(plan.stop) } : {}),
        ...(plan?.target ? { target_price: Number(plan.target) } : {}),
        ...(tradeNote.trim() ? { notes: tradeNote.trim() } : {}),
      };
      await placeOrder(req);
      setOrderMsg({ ok: true, text: `${side === "buy" ? "Buy" : "Sell"} order placed and journal capture is ready.`, journalReady: true });
      setTradeNote("");
    } catch (e: unknown) {
      setOrderMsg({ ok: false, text: e instanceof Error ? e.message : "Order failed", journalReady: false });
    } finally {
      setOrderBusy(false);
      setTimeout(() => setOrderMsg(null), 4000);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", fontSize: 12, borderRadius: "var(--radius-sm)", padding: "6px 8px",
    background: "var(--surface-3)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)",
    outline: "none",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Topbar */}
      <div className="workspace-card-header" style={{ background: "rgba(255,255,255,0.02)", paddingBottom: 8, flexShrink: 0 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span className="mono" style={{ fontSize: 16, fontWeight: 700 }}>{symbol}</span>
            <span className="caption">{referenceClose != null ? `Spot ${referenceClose.toFixed(2)}` : "Spot pending"}</span>
            {previewChange != null && (
              <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: previewChange >= 0 ? "var(--gain)" : "var(--loss)" }}>
                {previewChange >= 0 ? "+" : ""}{previewChange.toFixed(2)}%
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button onClick={() => onStepSymbol("prev")} className="workspace-chip-button">
            ← Prev
          </button>
          <button onClick={() => onStepSymbol("next")} className="workspace-chip-button">
            Next →
          </button>
          <button
            onClick={() => onOpenChart(symbol)}
            className="workspace-chip-button active"
          >
            Full chart
          </button>
          <button
            onClick={() => setShowChartDetails((current) => !current)}
            className={`workspace-chip-button${showChartDetails ? " active" : ""}`}
          >
            Analysis
          </button>
          <button
            onClick={onOpenPlan}
            className={`workspace-chip-button${planValid ? " active" : ""}`}
          >
            Trade plan
          </button>
          <button
            onClick={() => planValid ? setShowOrderTicket((current) => !current) : setOrderMsg({ ok: false, text: "Complete the trade plan to unlock execution." })}
            className={`workspace-chip-button${showOrderTicket ? " active" : ""}`}
            title={planValid ? "Open order draft" : "Plan required before execution"}
          >
            Order
          </button>
          {([
            ["trendline", PencilLine, "Trendline"],
            ["horizontal", Minus, "Support / resistance"],
            ["long", ArrowUpRight, "Long marker"],
            ["short", ArrowDownRight, "Short marker"],
          ] as const).map(([tool, Icon, label]) => (
            <button
              key={tool}
              onClick={() => {
                setActiveTool((current) => current === tool ? null : tool);
                setPendingPoint(null);
                if (activeTool !== tool) flashToolMsg(tool === "trendline" ? "Select first point" : "Click chart to place");
              }}
              className={`workspace-chip-button${activeTool === tool ? " active" : ""}`}
              title={label}
              style={{ width: 30, height: 30, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
            >
              <Icon size={13} />
            </button>
          ))}
          {pendingPoint && (
            <button
              onClick={() => setPendingPoint(null)}
              className="workspace-chip-button"
              title="Undo pending point"
              style={{ width: 30, height: 30, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
            >
              <Undo2 size={13} />
            </button>
          )}
          {drawings.length > 0 && (
            <button
              onClick={clearWatchlistDrawings}
              className="workspace-chip-button"
              title="Clear visible chart marks"
              style={{ width: 30, height: 30, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
            >
              <Eraser size={13} />
            </button>
          )}
          <label className="caption" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            Chart
            <select
              value={chartType}
              onChange={(event) => setChartType(event.target.value as ChartDisplayType)}
              style={{
                fontSize: 11,
                fontWeight: 600,
                borderRadius: "var(--radius-sm)",
                padding: "5px 9px",
                background: "var(--surface-2)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-primary)",
              }}
            >
              <option value="candles">Candles</option>
              <option value="bars">Bars</option>
              <option value="line">Line</option>
            </select>
          </label>
          <TimeframeTabs active={tf} onChange={setTf} />
        </div>
      </div>

      <div
        style={{
          margin: "8px 14px 0",
          padding: "8px 10px",
          borderRadius: 12,
          border: `1px solid ${planValid ? "rgba(45,181,116,0.28)" : "rgba(245,158,11,0.24)"}`,
          background: planValid ? "rgba(45,181,116,0.08)" : "rgba(245,158,11,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexShrink: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div className="label" style={{ color: planValid ? "var(--gain)" : "var(--warn)" }}>
            {planValid ? "Plan ready" : "Plan required"}
          </div>
          <div className="caption" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {planValid && planSummary ? planSummary : "Set entry, stop, target, size, thesis, and invalidation before order drafting."}
          </div>
        </div>
        <button className="workspace-chip-button active" onClick={onOpenPlan}>
          {planValid ? "Edit plan" : "Create plan"}
        </button>
      </div>

      {/* Chart */}
      {chartStats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, padding: "10px 14px 2px", flexShrink: 0 }}>
          {[
            { label: "Structure", value: chartStats.trend, tone: chartStats.trend === "Uptrend" ? "var(--gain)" : chartStats.trend === "Downtrend" ? "var(--loss)" : "var(--text-secondary)" },
            { label: `${tf} move`, value: chartStats.change != null ? `${chartStats.change >= 0 ? "+" : ""}${chartStats.change.toFixed(2)}%` : "-", tone: (chartStats.change ?? 0) >= 0 ? "var(--gain)" : "var(--loss)" },
            { label: "Range", value: chartStats.range != null ? `${chartStats.range.toFixed(1)}%` : "-", tone: "var(--text-secondary)" },
            { label: "Volume", value: chartStats.volumeVsAvg != null ? `${chartStats.volumeVsAvg.toFixed(2)}x avg` : "-", tone: (chartStats.volumeVsAvg ?? 0) >= 1.2 ? "var(--accent)" : "var(--text-secondary)" },
          ].map((item) => (
            <div key={item.label} style={{ minWidth: 0, padding: "7px 9px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="label" style={{ marginBottom: 3 }}>{item.label}</div>
              <div className="mono" style={{ fontSize: 12, fontWeight: 700, color: item.tone, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.value}</div>
            </div>
          ))}
        </div>
      )}
      {toolMsg && (
        <div className="caption" style={{ padding: "5px 14px 0", color: activeTool ? "var(--accent)" : "var(--text-tertiary)", flexShrink: 0 }}>
          {toolMsg}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: "8px 14px 0" }}>
        {chartLoading ? (
          <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid var(--surface-3)", borderTopColor: "var(--accent)", animation: "spin 1s linear infinite" }}>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        ) : chartError || candles.length === 0 ? (
          <span className="caption">No chart data</span>
        ) : (
          <div
            ref={chartWrapRef}
            onClick={handleChartToolClick}
            style={{ width: "100%", height: chartHeight, position: "relative", cursor: activeTool ? "crosshair" : "default" }}
          >
            <MiniChart candles={candles} height={chartHeight} dark={theme !== "light"} chartType={chartType} />
            <svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${Math.max(1, overlaySize.width)} ${Math.max(1, overlaySize.height)}`}
              preserveAspectRatio="none"
              style={{ position: "absolute", inset: 0, pointerEvents: activeTool ? "auto" : "none" }}
            >
              {drawings.map((drawing) => {
                const p1 = pointToCoord(drawing.p1);
                const p2 = drawing.p2 ? pointToCoord(drawing.p2) : p1;
                if (!p1 || !p2) return null;
                if (drawing.tool === "horizontal") {
                  return <line key={drawing.id} x1={0} y1={p1.y} x2={overlaySize.width} y2={p1.y} stroke={drawing.color} strokeWidth={1.25} strokeDasharray="5 5" opacity={0.9} />;
                }
                if (drawing.tool === "trendline") {
                  return <line key={drawing.id} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={drawing.color} strokeWidth={1.5} opacity={0.95} />;
                }
                const isLong = drawing.tool === "long";
                const label = isLong ? "LONG" : "SHORT";
                const y = p1.y + (isLong ? -10 : 18);
                return (
                  <g key={drawing.id}>
                    <path
                      d={isLong
                        ? `M ${p1.x} ${p1.y - 15} L ${p1.x - 6} ${p1.y - 3} L ${p1.x + 6} ${p1.y - 3} Z`
                        : `M ${p1.x} ${p1.y + 15} L ${p1.x - 6} ${p1.y + 3} L ${p1.x + 6} ${p1.y + 3} Z`}
                      fill={drawing.color}
                      opacity={0.95}
                    />
                    <text x={p1.x + 8} y={y} fill={drawing.color} fontSize={10} fontWeight={700}>{label}</text>
                  </g>
                );
              })}
              {pendingPoint && (() => {
                const p = pointToCoord(pendingPoint);
                return p ? <circle cx={p.x} cy={p.y} r={4} fill="var(--accent)" /> : null;
              })()}
            </svg>
          </div>
        )}
      </div>
      {showChartDetails && (
        <div style={{ padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
            {[
              { label: "Open", value: latestBar ? latestBar.open.toFixed(2) : "-" },
              { label: "High", value: latestBar ? latestBar.high.toFixed(2) : "-" },
              { label: "Low", value: latestBar ? latestBar.low.toFixed(2) : "-" },
              { label: "Close", value: latestBar ? latestBar.close.toFixed(2) : "-" },
              { label: "Support", value: chartStats ? formatNullablePrice(chartStats.support) : "-" },
              { label: "Resistance", value: chartStats ? formatNullablePrice(chartStats.resistance) : "-" },
              { label: "Last volume", value: chartStats?.latestVolume != null ? formatCompactVolume(chartStats.latestVolume) : "-" },
              { label: "Bars", value: chartStats ? String(chartStats.sampleSize) : "-" },
            ].map((item) => (
              <div key={item.label} style={{ padding: "7px 9px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="label" style={{ marginBottom: 3 }}>{item.label}</div>
                <div className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Order panel */}
      {showOrderTicket && (
        <div style={{ flexShrink: 0, padding: "14px 16px 16px", borderTop: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.025)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
          <div>
            <div className="label" style={{ marginBottom: 4 }}>Quick order</div>
            <div className="caption">{planSummary ?? "Keep execution attached to the active queue and auto-send the trade into journal review."}</div>
          </div>
          {estimatedValue != null && (
            <div style={{ padding: "7px 10px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="label" style={{ marginBottom: 2 }}>Value</div>
              <div className="mono" style={{ fontSize: 12, fontWeight: 700 }}>₹{estimatedValue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</div>
            </div>
          )}
        </div>

        {/* Buy / Sell */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
          {(["buy", "sell"] as const).map(s => (
            <button key={s} onClick={() => setSide(s)}
              style={{
                padding: "7px 0", fontSize: 12, fontWeight: 700, cursor: "pointer",
                background: side === s ? (s === "buy" ? "rgba(27,191,114,0.18)" : "rgba(229,56,59,0.18)") : "rgba(255,255,255,0.02)",
                color: side === s ? (s === "buy" ? "var(--gain)" : "var(--loss)") : "var(--text-tertiary)",
                border: `1px solid ${side === s ? (s === "buy" ? "rgba(27,191,114,0.34)" : "rgba(229,56,59,0.34)") : "var(--border-subtle)"}`,
                borderRadius: 12, textTransform: "capitalize",
                transition: "all var(--motion-instant) var(--ease-out)",
              }}>
              {s === "buy" ? "Buy" : "Sell"}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <div>
            <div className="label" style={{ marginBottom: 4 }}>Type</div>
            <div style={{ display: "flex", gap: 6 }}>
              {(["market", "limit"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setOrderType(type)}
                  style={{
                    flex: 1,
                    padding: "6px 0",
                    borderRadius: 10,
                    border: `1px solid ${orderType === type ? "rgba(244,247,251,0.3)" : "var(--border-subtle)"}`,
                    background: orderType === type ? "rgba(244,247,251,0.08)" : "var(--surface-3)",
                    color: orderType === type ? "var(--accent)" : "var(--text-secondary)",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    textTransform: "capitalize",
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="label" style={{ marginBottom: 4 }}>Qty</div>
            <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {[1, 5, 10, 25].map((size) => (
            <button
              key={size}
              onClick={() => setQty(String(size))}
              className="workspace-chip-button"
              style={{ paddingInline: 10 }}
            >
              {size}
            </button>
          ))}
        </div>

        <div style={{ marginBottom: 8 }}>
          <div className="label" style={{ marginBottom: 4 }}>Price (₹)</div>
          <input type="number" step="0.05" min="0" value={price} onChange={e => setPrice(e.target.value)} style={inputStyle} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <div>
            <div className="label" style={{ marginBottom: 4 }}>Setup</div>
            <select value={setupType} onChange={e => setSetupType(e.target.value)} style={inputStyle}>
              <option value="breakout">Breakout</option>
              <option value="pullback">Pullback</option>
              <option value="momentum">Momentum</option>
              <option value="reversal">Reversal</option>
              <option value="vcp">VCP</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <div className="label" style={{ marginBottom: 4 }}>Context</div>
            <div className="workspace-pill" style={{ height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {watchlistName ? `${watchlistName} queue` : "Active watchlist"}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <div className="label" style={{ marginBottom: 4 }}>Trade note</div>
          <textarea
            value={tradeNote}
            onChange={(e) => setTradeNote(e.target.value)}
            placeholder="Why this setup belongs in the queue right now…"
            style={{ ...inputStyle, minHeight: 66, resize: "vertical" }}
          />
        </div>

        {orderMsg && (
          <div style={{ marginBottom: 8, padding: "8px 10px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: orderMsg.ok ? "var(--gain)" : "var(--loss)" }}>
              {orderMsg.text}
            </div>
            {orderMsg.ok && orderMsg.journalReady && (
              <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 4 }}>
                Source: {watchlistName ? `${watchlistName} queue` : "Watchlist"} · Setup: {setupType || "—"}
              </div>
            )}
          </div>
        )}

        <button onClick={handleOrder} disabled={orderBusy || !planValid}
          style={{
            width: "100%", padding: "10px 0", borderRadius: 12, border: "none",
            background: side === "buy" ? "var(--gain)" : "var(--loss)", color: "#fff",
            fontSize: 12, fontWeight: 700, cursor: orderBusy ? "not-allowed" : "pointer",
            opacity: orderBusy || !planValid ? 0.5 : 1,
          }}>
          {!planValid ? "Plan required before order" : orderBusy ? "Placing…" : `Place ${side === "buy" ? "buy" : "sell"} order`}
        </button>
        </div>
      )}
    </div>
  );
}

function TradePlanCard({
  plan,
  selectedItem,
  onChange,
  onLifecycle,
}: {
  plan: TradePlan | null;
  selectedItem: WatchlistItem | null;
  onChange: (plan: TradePlan) => void;
  onLifecycle: (lifecycle: SymbolLifecycle) => void;
}) {
  if (!selectedItem || !plan) {
    return (
      <div style={{ borderRadius: 16, border: "1px dashed rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.02)", padding: 12 }}>
        <div className="label" style={{ marginBottom: 6 }}>Trade plan</div>
        <div className="caption">Select a shortlisted symbol, then define entry, stop, target, risk size, thesis, and invalidation before execution.</div>
      </div>
    );
  }

  const valid = isTradePlanValid(plan);
  const setField = (key: keyof TradePlan, value: string) => onChange({ ...plan, [key]: value });

  const inputStyle: React.CSSProperties = {
    width: "100%",
    fontSize: 12,
    borderRadius: 10,
    padding: "7px 9px",
    background: "var(--surface-3)",
    border: "1px solid var(--border-subtle)",
    color: "var(--text-primary)",
  };

  return (
    <div style={{ borderRadius: 16, border: `1px solid ${valid ? "rgba(45,181,116,0.32)" : "rgba(255,255,255,0.09)"}`, background: "rgba(255,255,255,0.025)", padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div>
          <div className="label" style={{ marginBottom: 4 }}>Trade plan</div>
          <div className="caption">{valid ? "Ready: execution actions are unlocked." : "Required before alerts or order drafts."}</div>
        </div>
        <select
          value={plan.lifecycle}
          onChange={(event) => onLifecycle(event.target.value as SymbolLifecycle)}
          style={{ fontSize: 12, borderRadius: 999, padding: "7px 10px", background: "var(--surface-3)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
        >
          {SYMBOL_LIFECYCLE.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
        </select>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <div className="label" style={{ marginBottom: 4 }}>Setup</div>
          <select value={plan.setupType} onChange={(event) => setField("setupType", event.target.value)} style={inputStyle}>
            <option value="Momentum">Momentum</option>
            <option value="Breakout">Breakout</option>
            <option value="Pullback">Pullback</option>
            <option value="VCP">VCP</option>
            <option value="Reversal">Reversal</option>
          </select>
        </div>
        <div>
          <div className="label" style={{ marginBottom: 4 }}>Timeframe</div>
          <input value={plan.timeframe} onChange={(event) => setField("timeframe", event.target.value)} style={inputStyle} />
        </div>
        {([
          ["Entry", "entry"],
          ["Stop", "stop"],
          ["Target", "target"],
          ["Position size", "positionSize"],
        ] as const).map(([label, key]) => (
          <div key={key}>
            <div className="label" style={{ marginBottom: 4 }}>{label}</div>
            <input type="number" min="0" step="0.05" value={plan[key]} onChange={(event) => setField(key, event.target.value)} style={inputStyle} />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8 }}>
        <div className="label" style={{ marginBottom: 4 }}>Thesis</div>
        <textarea value={plan.thesis} onChange={(event) => setField("thesis", event.target.value)} placeholder="Write your thesis for this symbol..." style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} />
      </div>
      <div style={{ marginTop: 8 }}>
        <div className="label" style={{ marginBottom: 4 }}>Invalidation rule</div>
        <textarea value={plan.invalidationRule} onChange={(event) => setField("invalidationRule", event.target.value)} placeholder="What proves the idea wrong..." style={{ ...inputStyle, minHeight: 50, resize: "vertical" }} />
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function WatchlistContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const {
    state: workflowState,
    savePlan,
    markLifecycle,
    rememberSymbol,
  } = useWorkflowState();
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newWlName, setNewWlName] = useState("");
  const [showNewWl, setShowNewWl] = useState(false);
  const [toast, setToast] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [chartSymbol, setChartSymbol] = useState<string | null>(null);

  const [symbolInput, setSymbolInput] = useState("");
  const [addMsg, setAddMsg] = useState("");
  const [adding, setAdding] = useState(false);
  const [searchResults, setSearchResults] = useState<SymbolSearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [listQuery, setListQuery] = useState("");
  const [deskFilter, setDeskFilter] = useState<"all" | "gainers" | "losers" | "momentum">("all");
  const [denseRows, setDenseRows] = useState(true);
  const [localMeta, setLocalMeta] = useState<Record<string, WatchlistItemMetadataUpdate>>({});
  const [tagInput, setTagInput] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [queueView, setQueueView] = useState<"all" | "pinned" | "tagged" | "needs-review">("all");
  const [activeTagFilter, setActiveTagFilter] = useState<string>("all");
  const [sortMode, setSortMode] = useState<"manual" | "setup" | "move" | "volume" | "rsi">("manual");
  const [showDeskControls, setShowDeskControls] = useState(false);
  const [showSelectedMeta, setShowSelectedMeta] = useState(false);
  const [showTradePlan, setShowTradePlan] = useState(false);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [queuePage, setQueuePage] = useState(0);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const metaKey = "alphavyuh-watchlist-meta-v1";

  function itemMetaKey(watchlistId: string, symbol: string) {
    return `${watchlistId}:${symbol}`;
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(metaKey);
      if (raw) setLocalMeta(JSON.parse(raw));
    } catch {
      // ignore corrupt workspace state
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(metaKey, JSON.stringify(localMeta));
  }, [localMeta]);

  const getItemMeta = useCallback((watchlistId: string | null, symbol: string | null) => {
    const list = watchlists.find((watchlist) => watchlist.id === watchlistId);
    const item = list?.items.find((entry) => entry.symbol === symbol);
    const fallback = watchlistId && symbol ? localMeta[itemMetaKey(watchlistId, symbol)] ?? {} : {};
    return {
      pinned: Boolean(fallback.pinned ?? item?.pinned),
      tags: fallback.tags ?? item?.tags ?? [],
      note: fallback.note ?? item?.note ?? "",
    };
  }, [localMeta, watchlists]);

  function applyItemMetaToState(watchlistId: string, symbol: string, updates: WatchlistItemMetadataUpdate) {
    setWatchlists((prev) =>
      prev.map((watchlist) =>
        watchlist.id !== watchlistId
          ? watchlist
          : {
              ...watchlist,
              items: watchlist.items.map((item) =>
                item.symbol !== symbol
                  ? item
                  : {
                      ...item,
                      ...(updates.pinned !== undefined ? { pinned: updates.pinned } : {}),
                      ...(updates.tags !== undefined ? { tags: updates.tags } : {}),
                      ...(updates.note !== undefined ? { note: updates.note } : {}),
                    }
              ),
            }
      )
    );
  }

  async function updateItemMeta(symbol: string, updates: WatchlistItemMetadataUpdate) {
    if (!activeId) return;
    const current = getItemMeta(activeId, symbol);
    const previous = {
      pinned: current.pinned,
      tags: current.tags,
      note: current.note,
    };
    applyItemMetaToState(activeId, symbol, updates);
    try {
      await updateWatchlistItemMetadata(activeId, symbol, updates);
      setLocalMeta((prev) => {
        const key = itemMetaKey(activeId, symbol);
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } catch (error) {
      setLocalMeta((prev) => ({
        ...prev,
        [itemMetaKey(activeId, symbol)]: {
          pinned: updates.pinned ?? previous.pinned,
          tags: updates.tags ?? previous.tags,
          note: updates.note ?? previous.note,
        },
      }));
      showToast(error instanceof Error ? `${error.message}. Saved locally for now.` : "Saved locally for now.");
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }

  async function loadWatchlists() {
    const wls = await getWatchlists();
    setWatchlists(wls);
    const requestedId = searchParams.get("id");
    if (wls.length > 0 && !activeId) {
      const requested = requestedId ? wls.find((watchlist) => watchlist.id === requestedId) : null;
      setActiveId(requested?.id ?? wls[0].id);
    }
    setLoading(false);
  }

  useEffect(() => { loadWatchlists(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = window.setTimeout(() => {
      getJournalEntries({ limit: 75 }).catch(() => ({ entries: [], total: 0 })).then((journal) => {
        setJournalEntries(journal.entries);
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, []);

  const symbolParam = searchParams.get("symbol");
  const watchlistIdParam = searchParams.get("id");
  useEffect(() => {
    if (!watchlistIdParam || watchlists.length === 0) return;
    const matched = watchlists.find((watchlist) => watchlist.id === watchlistIdParam);
    if (matched) {
      setActiveId(matched.id);
      if (matched.items?.[0]?.symbol) setChartSymbol(matched.items[0].symbol);
      router.replace("/watchlist", { scroll: false });
    }
  }, [router, watchlistIdParam, watchlists]);

  useEffect(() => {
    if (!symbolParam || watchlists.length === 0) return;
    let found = false;
    for (const wl of watchlists) {
      if (wl.items?.some((i: WatchlistItem) => i.symbol === symbolParam)) {
        setActiveId(wl.id);
        setChartSymbol(symbolParam);
        found = true;
        break;
      }
    }
    if (!found && activeId) {
      addToWatchlist(activeId, symbolParam)
        .then(() => getQuote(symbolParam))
        .then(quote => {
          const newItem: WatchlistItem = quote
            ? { symbol: quote.symbol, sort_order: 0, added_at: new Date().toISOString(), company_name: quote.company_name, sector: quote.sector, close: quote.close, pct_change: quote.pct_change, volume_ratio: quote.volume_ratio, rsi_14: quote.rsi_14, pinned: false, tags: [], note: "" }
            : { symbol: symbolParam, sort_order: 0, added_at: new Date().toISOString(), pinned: false, tags: [], note: "" };
          setWatchlists(prev => prev.map(w => w.id === activeId ? { ...w, items: [...(w.items || []), newItem] } : w));
          setChartSymbol(symbolParam);
        })
        .catch(() => {});
    }
    router.replace("/watchlist", { scroll: false });
  }, [symbolParam, watchlists.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeWl = watchlists.find(w => w.id === activeId) ?? null;
  const chartHref = useCallback((symbol: string) => {
    const params = new URLSearchParams({ from: "watchlist", full: "1" });
    if (activeWl?.id) params.set("watchlistId", activeWl.id);
    if (activeWl?.name) params.set("watchlist", activeWl.name);
    return `/charts/${symbol}?${params.toString()}`;
  }, [activeWl?.id, activeWl?.name]);
  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    for (const item of activeWl?.items ?? []) {
      const meta = getItemMeta(activeId, item.symbol);
      for (const tag of meta.tags ?? []) tags.add(tag);
    }
    return Array.from(tags).sort();
  }, [activeId, activeWl?.items, getItemMeta]);
  const queueCounts = useMemo(() => {
    const items = activeWl?.items ?? [];
    let pinned = 0;
    let tagged = 0;
    let needsReview = 0;
    for (const item of items) {
      const meta = getItemMeta(activeId, item.symbol);
      if (meta.pinned) pinned += 1;
      if ((meta.tags?.length ?? 0) > 0) tagged += 1;
      if (!meta.note?.trim()) needsReview += 1;
    }
    return {
      total: items.length,
      pinned,
      tagged,
      needsReview,
    };
  }, [activeId, activeWl?.items, getItemMeta]);
  const setupDesk = useMemo(() => {
    const items = activeWl?.items ?? [];
    const ranked = items
      .map((item) => ({ item, setup: getSetupSignal(item) }))
      .sort((a, b) => b.setup.score - a.setup.score);
    return {
      top: ranked.slice(0, 3),
      ready: ranked.filter((entry) => entry.setup.score >= 80).length,
      watch: ranked.filter((entry) => entry.setup.score >= 55 && entry.setup.score < 80).length,
      weak: ranked.filter((entry) => entry.setup.score < 55).length,
      average: ranked.length ? Math.round(ranked.reduce((sum, entry) => sum + entry.setup.score, 0) / ranked.length) : 0,
    };
  }, [activeWl?.items]);
  const symbolReviewMap = useMemo(() => {
    const next = new Map<string, { state: "reviewed" | "needs-review" | "new"; closed: number; reviewed: number; latestLesson: string | null; lastSetup: string | null }>();
    for (const entry of journalEntries) {
      const current = next.get(entry.symbol) ?? { state: "new" as const, closed: 0, reviewed: 0, latestLesson: null, lastSetup: null };
      if (entry.status === "closed") current.closed += 1;
      if (entry.status === "closed" && entry.lessons?.trim()) {
        current.reviewed += 1;
        current.latestLesson = current.latestLesson ?? entry.lessons.trim();
      }
      current.lastSetup = current.lastSetup ?? entry.setup_type ?? null;
      next.set(entry.symbol, current);
    }
    Array.from(next.entries()).forEach(([symbol, value]) => {
      next.set(symbol, {
        ...value,
        state: value.reviewed > 0 ? "reviewed" : value.closed > 0 ? "needs-review" : "new",
      });
    });
    return next;
  }, [journalEntries]);
  const visibleItems = useMemo(() => {
    const query = listQuery.trim().toLowerCase();
    const filtered = (activeWl?.items ?? []).filter((item) => {
      const meta = getItemMeta(activeId, item.symbol);
      const matchesFilter =
        deskFilter === "all" ? true :
        deskFilter === "gainers" ? (item.pct_change ?? 0) > 0 :
        deskFilter === "losers" ? (item.pct_change ?? 0) < 0 :
        ((item.volume_ratio ?? 0) >= 1.5 || (item.rsi_14 ?? 0) >= 60);
      const matchesQueueView =
        queueView === "all" ? true :
        queueView === "pinned" ? Boolean(meta.pinned) :
        queueView === "tagged" ? (meta.tags?.length ?? 0) > 0 :
        !meta.note?.trim();
      const matchesTagFilter =
        activeTagFilter === "all" ? true : Boolean(meta.tags?.includes(activeTagFilter));
      const matchesQuery = !query
        ? true
        : item.symbol.toLowerCase().includes(query)
          || item.company_name?.toLowerCase().includes(query)
          || item.sector?.toLowerCase().includes(query);
      return matchesFilter && matchesQueueView && matchesTagFilter && matchesQuery;
    });
    return filtered.sort((a, b) => {
      const aMeta = getItemMeta(activeId, a.symbol);
      const bMeta = getItemMeta(activeId, b.symbol);
      const aPinned = aMeta.pinned ? 1 : 0;
      const bPinned = bMeta.pinned ? 1 : 0;
      if (sortMode === "move") {
        const changeDiff = (b.pct_change ?? 0) - (a.pct_change ?? 0);
        if (changeDiff !== 0) return changeDiff;
      }
      if (sortMode === "setup") {
        const setupDiff = getSetupSignal(b).score - getSetupSignal(a).score;
        if (setupDiff !== 0) return setupDiff;
      }
      if (sortMode === "volume") {
        const volumeDiff = (b.volume_ratio ?? 0) - (a.volume_ratio ?? 0);
        if (volumeDiff !== 0) return volumeDiff;
      }
      if (sortMode === "rsi") {
        const rsiDiff = (b.rsi_14 ?? 0) - (a.rsi_14 ?? 0);
        if (rsiDiff !== 0) return rsiDiff;
      }
      if (sortMode === "manual" && aPinned !== bPinned) return bPinned - aPinned;
      return a.sort_order - b.sort_order;
    });
  }, [activeId, activeWl?.items, deskFilter, listQuery, getItemMeta, queueView, activeTagFilter, sortMode]);
  const queuePageCount = Math.max(1, Math.ceil(visibleItems.length / WATCHLIST_PAGE_SIZE));
  const pageStart = Math.min(queuePage, queuePageCount - 1) * WATCHLIST_PAGE_SIZE;
  const pageItems = visibleItems.slice(pageStart, pageStart + WATCHLIST_PAGE_SIZE);
  const pageSymbolsKey = pageItems.map(item => item.symbol).join(",");
  const selectedItem = activeWl?.items.find(item => item.symbol === chartSymbol) ?? null;
  const selectedItemMeta = getItemMeta(activeId, chartSymbol);
  const selectedReviewState = chartSymbol ? symbolReviewMap.get(chartSymbol) : null;
  const selectedPlan = chartSymbol
    ? workflowState.plans[chartSymbol] ?? createDraftPlan(chartSymbol, selectedItem?.close ?? null, selectedItem ? getSetupSignal(selectedItem).label : "Momentum")
    : null;
  const selectedPlanValid = isTradePlanValid(selectedPlan);
  const canReorder = deskFilter === "all" && !listQuery.trim() && queueView === "all" && activeTagFilter === "all" && sortMode === "manual";

  useEffect(() => {
    if (chartSymbol) rememberSymbol(chartSymbol);
  }, [chartSymbol, rememberSymbol]);

  useEffect(() => {
    if (!liveQuotePollingEnabled) return;
    if (!activeId || !pageItems.length) return;
    let cancelled = false;
    let streamConnected = false;
    const visibleSymbols = pageItems.map((item) => item.symbol);

    function applyLiveUpdates(updates: Array<{ symbol: string; close: number | null; pct_change: number | null }>) {
      const liveMap = new Map(updates.filter((u) => u.close != null).map((u) => [u.symbol, u]));
      if (!liveMap.size) return;
      setWatchlists(prev => prev.map(w => (
        w.id !== activeId
          ? w
          : {
              ...w,
              items: w.items.map(item => {
                const live = liveMap.get(item.symbol);
                return live ? { ...item, close: live.close ?? item.close, pct_change: live.pct_change } : item;
              }),
            }
      )));
    }

    const stopStream = streamLiveQuotes(
      visibleSymbols,
      (ticks) => {
        if (cancelled) return;
        applyLiveUpdates(ticks);
      },
      (status) => {
        streamConnected = status.connected;
      }
    );

    async function refreshLiveQuotes() {
      if (streamConnected) return;
      const updates = await Promise.all(
        pageItems.map(async (item) => {
          const live = await getQuoteLive(item.symbol).catch(() => null);
          return live ? {
            symbol: item.symbol,
            close: live.close,
            pct_change: live.pct_change,
          } : null;
        })
      );

      if (cancelled) return;
      applyLiveUpdates(updates.filter((update): update is { symbol: string; close: number | null; pct_change: number | null } => Boolean(update)));
    }

    refreshLiveQuotes();
    const id = window.setInterval(refreshLiveQuotes, 60_000);
    return () => {
      cancelled = true;
      stopStream();
      window.clearInterval(id);
    };
  // We intentionally refresh only the visible five-symbol queue page.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, pageSymbolsKey]);

  const moveSelection = useCallback((direction: "prev" | "next") => {
    if (!visibleItems.length) return;
    const currentIndex = visibleItems.findIndex(item => item.symbol === chartSymbol);
    if (currentIndex === -1) {
      setChartSymbol(visibleItems[0].symbol);
      return;
    }
    const nextIndex = direction === "next"
      ? Math.min(visibleItems.length - 1, currentIndex + 1)
      : Math.max(0, currentIndex - 1);
    const nextItem = visibleItems[nextIndex];
    if (nextItem) {
      setChartSymbol(nextItem.symbol);
    }
  }, [chartSymbol, visibleItems]);

  useEffect(() => {
    if (!visibleItems.length) {
      setChartSymbol(null);
      return;
    }
    const hasSelectedSymbol = chartSymbol && visibleItems.some(item => item.symbol === chartSymbol);
    if (!hasSelectedSymbol) {
      setChartSymbol(visibleItems[0].symbol);
    }
  }, [activeId, chartSymbol, visibleItems]);

  useEffect(() => {
    setQueuePage(0);
  }, [activeId, deskFilter, listQuery, queueView, activeTagFilter, sortMode]);

  useEffect(() => {
    if (queuePage > queuePageCount - 1) {
      setQueuePage(queuePageCount - 1);
    }
  }, [queuePage, queuePageCount]);

  useEffect(() => {
    if (!chartSymbol) return;
    const selectedIndex = visibleItems.findIndex(item => item.symbol === chartSymbol);
    if (selectedIndex === -1) return;
    const selectedPage = Math.floor(selectedIndex / WATCHLIST_PAGE_SIZE);
    if (selectedPage !== queuePage) {
      setQueuePage(selectedPage);
    }
  }, [chartSymbol, queuePage, visibleItems]);

  useEffect(() => {
    function handleDeskKeys(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tagName = target?.tagName ?? "";
      const isTyping = tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" || Boolean(target?.closest("[contenteditable='true']"));
      if (isTyping || !visibleItems.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveSelection("next");
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        moveSelection("prev");
      }
      if (e.key === "Enter" && chartSymbol) {
        e.preventDefault();
        router.push(chartHref(chartSymbol));
      }
    }
    window.addEventListener("keydown", handleDeskKeys);
    return () => window.removeEventListener("keydown", handleDeskKeys);
  }, [chartHref, chartSymbol, moveSelection, router, visibleItems]);

  async function handleDeleteWatchlist(id: string) {
    if (!confirm("Delete this watchlist and all its stocks?")) return;
    try {
      await deleteWatchlist(id);
      const remaining = watchlists.filter(w => w.id !== id);
      setWatchlists(remaining);
      if (activeId === id) setActiveId(remaining[0]?.id ?? null);
      if (chartSymbol) setChartSymbol(null);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function handleCreateWatchlist() {
    if (!newWlName.trim()) return;
    try {
      const wl = await createWatchlist(newWlName.trim());
      setWatchlists(prev => [...prev, { ...wl, items: [] }]);
      setActiveId(wl.id);
      setNewWlName("");
      setShowNewWl(false);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Failed to create watchlist");
    }
  }

  const handleSearchInput = useCallback(async (q: string) => {
    setSymbolInput(q);
    if (q.length >= 1) {
      const results = await searchSymbols(q).catch(() => []);
      setSearchResults(results.slice(0, 6));
      setShowDropdown(results.length > 0);
    } else {
      setSearchResults([]);
      setShowDropdown(false);
    }
  }, []);

  async function handlePickSymbol(symbol: string) {
    setSymbolInput(symbol);
    setShowDropdown(false);
    setSearchResults([]);
    if (!activeId) return;
    setAdding(true);
    setAddMsg("");
    try {
      await addToWatchlist(activeId, symbol);
      const quote = await getQuote(symbol);
      const newItem: WatchlistItem = quote
        ? { symbol: quote.symbol, sort_order: 0, added_at: new Date().toISOString(), company_name: quote.company_name, sector: quote.sector, close: quote.close, pct_change: quote.pct_change, volume_ratio: quote.volume_ratio, rsi_14: quote.rsi_14, pinned: false, tags: [], note: "" }
        : { symbol, sort_order: 0, added_at: new Date().toISOString(), pinned: false, tags: [], note: "" };
      setWatchlists(prev => prev.map(w => w.id === activeId ? { ...w, items: [...w.items, newItem] } : w));
      setChartSymbol(symbol);
      setSymbolInput("");
      setAddMsg("Added");
    } catch (e: unknown) {
      setAddMsg(e instanceof Error ? e.message : "Error");
    } finally {
      setAdding(false);
      setTimeout(() => setAddMsg(""), 2500);
    }
  }

  async function addShortlistedToActive(symbol: string) {
    if (!activeId) return;
    const normalized = symbol.trim().toUpperCase();
    const alreadyExists = activeWl?.items.some((item) => item.symbol === normalized);
    if (alreadyExists) {
      setChartSymbol(normalized);
      showToast(`${normalized} is already in this watchlist`);
      return;
    }
    setAdding(true);
    setAddMsg("");
    try {
      await addToWatchlist(activeId, normalized);
      const quote = await getQuote(normalized).catch(() => null);
      const newItem: WatchlistItem = quote
        ? { symbol: quote.symbol, sort_order: activeWl?.items.length ?? 0, added_at: new Date().toISOString(), company_name: quote.company_name, sector: quote.sector, close: quote.close, pct_change: quote.pct_change, volume_ratio: quote.volume_ratio, rsi_14: quote.rsi_14, pinned: false, tags: [], note: "" }
        : { symbol: normalized, sort_order: activeWl?.items.length ?? 0, added_at: new Date().toISOString(), pinned: false, tags: [], note: "" };
      setWatchlists(prev => prev.map(w => w.id === activeId ? { ...w, items: [...w.items, newItem] } : w));
      setChartSymbol(normalized);
      showToast(`${normalized} moved from shortlist`);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Could not add shortlisted symbol");
    } finally {
      setAdding(false);
    }
  }

  async function addStarterSymbols() {
    if (!activeId) return;
    setAdding(true);
    setAddMsg("");
    try {
      const existing = new Set((activeWl?.items ?? []).map((item) => item.symbol));
      const symbols = STARTER_SYMBOLS.filter((symbol) => !existing.has(symbol));
      const newItems: WatchlistItem[] = [];
      for (const symbol of symbols) {
        await addToWatchlist(activeId, symbol).catch(() => {});
        const quote = await getQuote(symbol).catch(() => null);
        newItems.push(quote
          ? { symbol: quote.symbol, sort_order: newItems.length, added_at: new Date().toISOString(), company_name: quote.company_name, sector: quote.sector, close: quote.close, pct_change: quote.pct_change, volume_ratio: quote.volume_ratio, rsi_14: quote.rsi_14, pinned: false, tags: [], note: "" }
          : { symbol, sort_order: newItems.length, added_at: new Date().toISOString(), pinned: false, tags: [], note: "" }
        );
      }
      if (newItems.length) {
        setWatchlists(prev => prev.map(w => w.id === activeId ? { ...w, items: [...w.items, ...newItems] } : w));
        setChartSymbol(newItems[0].symbol);
      }
      setAddMsg(newItems.length ? "Starter list added" : "Already added");
    } catch (e: unknown) {
      setAddMsg(e instanceof Error ? e.message : "Error");
    } finally {
      setAdding(false);
      setTimeout(() => setAddMsg(""), 2500);
    }
  }

  async function handleAddSymbol() {
    if (!activeId || !symbolInput.trim()) return;
    const sym = symbolInput.trim().toUpperCase();
    setAdding(true);
    setAddMsg("");
    setShowDropdown(false);
    setSearchResults([]);
    try {
      await addToWatchlist(activeId, sym);
      const quote = await getQuote(sym);
      const newItem: WatchlistItem = quote
        ? { symbol: quote.symbol, sort_order: 0, added_at: new Date().toISOString(), company_name: quote.company_name, sector: quote.sector, close: quote.close, pct_change: quote.pct_change, volume_ratio: quote.volume_ratio, rsi_14: quote.rsi_14, pinned: false, tags: [], note: "" }
        : { symbol: sym, sort_order: 0, added_at: new Date().toISOString(), pinned: false, tags: [], note: "" };
      setWatchlists(prev => prev.map(w => w.id === activeId ? { ...w, items: [...w.items, newItem] } : w));
      setChartSymbol(sym);
      setSymbolInput("");
      setAddMsg("Added");
    } catch (e: unknown) {
      setAddMsg(e instanceof Error ? e.message : "Error");
    } finally {
      setAdding(false);
      setTimeout(() => setAddMsg(""), 2500);
    }
  }

  async function handleRemove(symbol: string) {
    if (!activeId) return;
    await removeFromWatchlist(activeId, symbol);
    setWatchlists(prev =>
      prev.map(w => w.id === activeId ? { ...w, items: w.items.filter(i => i.symbol !== symbol) } : w)
    );
    if (chartSymbol === symbol) setChartSymbol(null);
  }

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !activeId) return;
    setWatchlists(prev =>
      prev.map(w => {
        if (w.id !== activeId) return w;
        const oldIdx = w.items.findIndex(i => i.symbol === active.id);
        const newIdx = w.items.findIndex(i => i.symbol === over.id);
        const reordered = arrayMove(w.items, oldIdx, newIdx).map((item, idx) => ({ ...item, sort_order: idx }));
        reorderWatchlist(activeId, reordered.map(i => ({ symbol: i.symbol, sort_order: i.sort_order })));
        return { ...w, items: reordered };
      })
    );
  }, [activeId]);

  const selectedMetrics = selectedItem ? [
    {
      label: "Last price",
      value: selectedItem.close != null ? `₹${selectedItem.close.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—",
      tone: "var(--text-primary)",
    },
    {
      label: "Day move",
      value: selectedItem.pct_change != null ? `${selectedItem.pct_change >= 0 ? "+" : ""}${selectedItem.pct_change.toFixed(2)}%` : "—",
      tone: (selectedItem.pct_change ?? 0) >= 0 ? "var(--gain)" : "var(--loss)",
    },
    {
      label: "Volume ratio",
      value: selectedItem.volume_ratio != null ? `${selectedItem.volume_ratio.toFixed(2)}×` : "—",
      tone: "var(--accent)",
    },
    {
      label: "RSI",
      value: selectedItem.rsi_14 != null ? selectedItem.rsi_14.toFixed(0) : "—",
      tone: "var(--text-secondary)",
    },
  ] : [];
  const selectedSetup = selectedItem ? getSetupSignal(selectedItem) : null;

  useEffect(() => {
    if (activeTagFilter !== "all" && !availableTags.includes(activeTagFilter)) {
      setActiveTagFilter("all");
    }
  }, [activeTagFilter, availableTags]);

  useEffect(() => {
    setTagInput("");
    setNoteDraft(selectedItemMeta.note ?? "");
  }, [chartSymbol, activeId, selectedItemMeta.note]);

  async function addTagToSelected() {
    if (!selectedItem || !activeId) return;
    const nextTag = tagInput.trim().toLowerCase();
    if (!nextTag) return;
    await updateItemMeta(selectedItem.symbol, {
      tags: Array.from(new Set([...(selectedItemMeta.tags ?? []), nextTag])).slice(0, 6),
    });
    setTagInput("");
  }

  async function removeTagFromSelected(tag: string) {
    if (!selectedItem) return;
    await updateItemMeta(selectedItem.symbol, {
      tags: (selectedItemMeta.tags ?? []).filter((item) => item !== tag),
    });
  }

  async function saveSelectedNote() {
    if (!selectedItem) return;
    const trimmed = noteDraft.trim();
    const currentNote = (selectedItemMeta.note ?? "").trim();
    if (trimmed === currentNote) return;
    await updateItemMeta(selectedItem.symbol, { note: trimmed || null });
  }

  function resetDeskView() {
    setQueueView("all");
    setDeskFilter("all");
    setActiveTagFilter("all");
    setSortMode("manual");
    setListQuery("");
  }

  function saveSelectedPlan(nextPlan: TradePlan) {
    savePlan(nextPlan);
  }

  function moveSelectedLifecycle(lifecycle: SymbolLifecycle) {
    if (!selectedPlan) return;
    savePlan({ ...selectedPlan, lifecycle });
    markLifecycle(selectedPlan.symbol, lifecycle);
    showToast(`Lifecycle moved to ${lifecycle}`);
  }

  async function markSelectedReviewLater() {
    if (!selectedItem) return;
    const tags = Array.from(new Set([...(selectedItemMeta.tags ?? []), "review-later"])).slice(0, 6);
    const note = selectedItemMeta.note?.trim()
      ? selectedItemMeta.note
      : "Review later: setup needs another confirmation before planning.";
    await updateItemMeta(selectedItem.symbol, { tags, note });
    markLifecycle(selectedItem.symbol, "Watch");
    showToast(`${selectedItem.symbol} marked for review later`);
  }

  return (
    <div className="workspace-page" style={{ gap: 10, minHeight: "calc(100vh - 104px)" }}>
      <div className="workspace-grid" style={{ gridTemplateColumns: "380px minmax(0, 1fr)", minHeight: "calc(100vh - 178px)" }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 88, left: "50%", transform: "translateX(-50%)", zIndex: 50, fontSize: 13, padding: "10px 16px", borderRadius: 16, boxShadow: "var(--shadow-panel)", background: "linear-gradient(180deg, rgba(20,29,33,0.96), rgba(13,20,24,0.96))", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" }}>
          {toast}
        </div>
      )}

      {/* ── Stock list ─────────────────────────────────────── */}
      <div className="workspace-card workspace-card-muted" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div className="workspace-card-header" style={{ paddingBottom: 10, flexShrink: 0 }}>
          <div>
            <div className="workspace-card-title">Watchlist</div>
            <div className="caption">{activeWl ? `${activeWl.items.length} stock${activeWl.items.length !== 1 ? "s" : ""}` : "Select or create a list"}</div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <select
                aria-label="Select watchlist"
                value={activeId ?? ""}
                onChange={(event) => setActiveId(event.target.value || null)}
                style={{ maxWidth: 150, fontSize: 12, borderRadius: "var(--radius-sm)", padding: "5px 8px", background: "var(--surface-3)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", outline: "none" }}
              >
                {watchlists.map((wl) => (
                  <option key={wl.id} value={wl.id}>{wl.name}</option>
                ))}
              </select>
              <button
                onClick={() => setShowNewWl(o => !o)}
                className="workspace-chip-button"
                aria-label="Create watchlist"
                title="Create watchlist"
                style={{ width: 30, height: 30, padding: 0 }}
              >
                <Plus size={14} />
              </button>
            {activeWl && (
              <>
              {addMsg && (
                <span style={{ fontSize: 11, fontWeight: 500, color: addMsg === "Added" ? "var(--gain)" : "var(--loss)" }}>
                  {addMsg}
                </span>
              )}
              <div style={{ position: "relative" }}>
                <Search size={11} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)", pointerEvents: "none" }} />
                <input
                  value={symbolInput}
                  onChange={e => handleSearchInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      if (searchResults.length > 0) handlePickSymbol(searchResults[0].symbol);
                      else handleAddSymbol();
                    }
                    if (e.key === "Escape") setShowDropdown(false);
                  }}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                  placeholder="Add symbol…"
                  style={{ fontSize: 12, borderRadius: "var(--radius-sm)", paddingLeft: 24, paddingRight: 8, paddingTop: 5, paddingBottom: 5, background: "var(--surface-3)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", outline: "none", width: 130 }}
                />
                {showDropdown && searchResults.length > 0 && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-dropdown)", zIndex: 20, marginTop: 2, maxHeight: 200, overflowY: "auto", background: "var(--surface-float)", border: "1px solid var(--border-subtle)" }}>
                    {searchResults.map(s => (
                      <div key={s.symbol} onMouseDown={() => handlePickSymbol(s.symbol)}
                        style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid var(--border-subtle)" }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--surface-3)"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{s.symbol}</div>
                        <div className="caption" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.company_name}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={handleAddSymbol} disabled={adding || !symbolInput.trim()}
                style={{ padding: "5px 8px", borderRadius: "var(--radius-sm)", fontSize: 11, fontWeight: 700, background: "linear-gradient(180deg, var(--accent-strong), var(--accent))", color: "var(--text-on-accent)", border: "1px solid var(--border-focus)", cursor: "pointer", opacity: (adding || !symbolInput.trim()) ? 0.5 : 1 }}>
                {adding ? "…" : "Add"}
              </button>
              </>
            )}
          </div>
        </div>
        {showNewWl && (
          <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border-subtle)", display: "flex", gap: 6, flexShrink: 0 }}>
            <input
              autoFocus
              value={newWlName}
              onChange={e => setNewWlName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreateWatchlist()}
              placeholder="New watchlist name..."
              style={{ flex: 1, fontSize: 12, borderRadius: "var(--radius-sm)", padding: "6px 8px", background: "var(--surface-3)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", outline: "none" }}
            />
            <button onClick={handleCreateWatchlist} className="workspace-chip-button active">Create</button>
            <button onClick={() => setShowNewWl(false)} className="workspace-chip-button">Cancel</button>
          </div>
        )}

        {workflowState.shortlist.length > 0 && (
          <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "grid", gap: 8, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div className="label">Scanner shortlist</div>
                <div className="caption">{workflowState.shortlist.length} ideas waiting for plan review</div>
              </div>
              <button className="workspace-chip-button" onClick={() => router.push("/scanner")}>Scanner</button>
            </div>
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
              {workflowState.shortlist.slice(-8).reverse().map((item) => {
                const inActiveList = Boolean(activeWl?.items.some((entry) => entry.symbol === item.symbol));
                return (
                  <button
                    key={item.symbol}
                    className={`workspace-chip-button${inActiveList ? " active" : ""}`}
                    onClick={() => inActiveList ? setChartSymbol(item.symbol) : void addShortlistedToActive(item.symbol)}
                    title={inActiveList ? "Open in active watchlist" : "Move into active watchlist"}
                    style={{ flex: "0 0 auto" }}
                  >
                    {item.symbol} · {item.lifecycle}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "grid", gap: 10, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 320 }}>
              <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)", pointerEvents: "none" }} />
              <input
                value={listQuery}
                onChange={(e) => setListQuery(e.target.value)}
                placeholder="Filter active watchlist…"
                style={{ width: "100%", fontSize: 12, borderRadius: 999, padding: "7px 12px 7px 30px", background: "var(--surface-3)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
              />
            </div>
            <div className="workspace-pill-row">
              {[
                { id: "all", label: "All" },
                { id: "pinned", label: "Pinned" },
                { id: "tagged", label: "Tagged" },
                { id: "needs-review", label: "Needs review" },
              ].map((view) => (
                <button
                  key={view.id}
                  className={`workspace-chip-button${queueView === view.id ? " active" : ""}`}
                  onClick={() => setQueueView(view.id as typeof queueView)}
                >
                  {view.label}
                </button>
              ))}
            </div>
            {showDeskControls && (
              <>
                <div className="workspace-pill-row">
                  {[
                    { id: "all", label: "All moves" },
                    { id: "gainers", label: "Gainers" },
                    { id: "losers", label: "Losers" },
                    { id: "momentum", label: "Momentum" },
                  ].map((filter) => (
                    <button
                      key={filter.id}
                      className={`workspace-chip-button${deskFilter === filter.id ? " active" : ""}`}
                      onClick={() => setDeskFilter(filter.id as typeof deskFilter)}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button className={`workspace-chip-button${denseRows ? "" : " active"}`} onClick={() => setDenseRows(false)}>
                    Comfortable
                  </button>
                  <button className={`workspace-chip-button${denseRows ? " active" : ""}`} onClick={() => setDenseRows(true)}>
                    Dense
                  </button>
                </div>
                {availableTags.length > 0 && (
                  <select
                    value={activeTagFilter}
                    onChange={(e) => setActiveTagFilter(e.target.value)}
                    style={{ fontSize: 12, borderRadius: 999, padding: "7px 12px", background: "var(--surface-3)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
                  >
                    <option value="all">All tags</option>
                    {availableTags.map((tag) => (
                      <option key={tag} value={tag}>#{tag}</option>
                    ))}
                  </select>
                )}
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as typeof sortMode)}
                  style={{ fontSize: 12, borderRadius: 999, padding: "7px 12px", background: "var(--surface-3)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
                >
                  <option value="manual">Manual order</option>
                  <option value="setup">Sort by setup</option>
                  <option value="move">Sort by move</option>
                  <option value="volume">Sort by volume ratio</option>
                  <option value="rsi">Sort by RSI</option>
                </select>
              </>
            )}
            <div className="caption">
              {visibleItems.length > 0
                ? `Showing ${pageStart + 1}-${Math.min(pageStart + WATCHLIST_PAGE_SIZE, visibleItems.length)} of ${visibleItems.length}. Arrow keys move through the full queue.`
                : canReorder ? "Drag to reprioritize. Enter opens chart." : "Filtered or ranked view active."}
            </div>
          </div>
        </div>

        {/* Stock rows */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {!activeWl ? (
            <EmptyState title="No watchlist selected" description="Create or select a watchlist from the sidebar, then use it as the bridge from scanner ideas to chart review." />
          ) : activeWl.items.length === 0 ? (
            <EmptyState
              title="No stocks yet"
              description="Start with a liquid sample queue, then replace it with your own names as your scanner finds better setups."
              action={{ label: adding ? "Adding..." : "Add starter queue", onClick: () => void addStarterSymbols() }}
            />
          ) : visibleItems.length === 0 ? (
            <EmptyState
              title="No names in this view"
              description="The current watchlist filter is too narrow. Reset the desk view or clear your search to bring the full queue back."
              action={{ label: "Reset view", onClick: () => { setDeskFilter("all"); setListQuery(""); } }}
            />
          ) : (
            canReorder ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={pageItems.map(i => i.symbol)} strategy={verticalListSortingStrategy}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead style={{ position: "sticky", top: 0, zIndex: 10, background: "rgba(10,16,20,0.96)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border-subtle)" }}>
                      <tr>
                        <th style={{ width: 28 }} />
                        <th className="label" style={{ padding: "8px 10px", textAlign: "left" }}>Symbol</th>
                        <th className="label" style={{ padding: "8px 10px", textAlign: "right" }}>Price / Chg</th>
                        <th className="label" style={{ padding: "8px 6px", textAlign: "right" }}>Vol / RSI</th>
                        <th style={{ width: 28 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map(item => {
                        const meta = getItemMeta(activeId, item.symbol);
                        return (
                        <SortableRow
                          key={item.symbol}
                          item={item}
                          isSelected={chartSymbol === item.symbol}
                          pinned={Boolean(meta.pinned)}
                          reviewState={symbolReviewMap.get(item.symbol)?.state}
                          onRemove={handleRemove}
                          onSelect={setChartSymbol}
                          onOpenChart={(sym) => router.push(chartHref(sym))}
                          dense={denseRows}
                        />
                        );
                      })}
                    </tbody>
                  </table>
                </SortableContext>
              </DndContext>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead style={{ position: "sticky", top: 0, zIndex: 10, background: "rgba(10,16,20,0.96)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border-subtle)" }}>
                  <tr>
                    <th style={{ width: 28 }} />
                    <th className="label" style={{ padding: "8px 10px", textAlign: "left" }}>Symbol</th>
                    <th className="label" style={{ padding: "8px 10px", textAlign: "right" }}>Price / Chg</th>
                    <th className="label" style={{ padding: "8px 6px", textAlign: "right" }}>Vol / RSI</th>
                    <th style={{ width: 28 }} />
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map(item => {
                    const meta = getItemMeta(activeId, item.symbol);
                    return (
                      <SortableRow
                        key={item.symbol}
                        item={item}
                        isSelected={chartSymbol === item.symbol}
                        pinned={Boolean(meta.pinned)}
                        reviewState={symbolReviewMap.get(item.symbol)?.state}
                      onRemove={handleRemove}
                      onSelect={setChartSymbol}
                      onOpenChart={(sym) => router.push(chartHref(sym))}
                      dense={denseRows}
                    />
                    );
                  })}
                </tbody>
              </table>
            )
          )}
          {activeWl && visibleItems.length > WATCHLIST_PAGE_SIZE && (
            <div
              style={{
                marginTop: "auto",
                padding: "10px 14px",
                borderTop: "1px solid rgba(255,255,255,0.06)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                flexShrink: 0,
              }}
            >
              <button
                className="workspace-chip-button"
                onClick={() => setQueuePage(page => Math.max(0, page - 1))}
                disabled={queuePage === 0}
                style={{ opacity: queuePage === 0 ? 0.45 : 1 }}
              >
                ← 5
              </button>
              <div className="caption" style={{ textAlign: "center" }}>
                Page {queuePage + 1} / {queuePageCount}
              </div>
              <button
                className="workspace-chip-button"
                onClick={() => setQueuePage(page => Math.min(queuePageCount - 1, page + 1))}
                disabled={queuePage >= queuePageCount - 1}
                style={{ opacity: queuePage >= queuePageCount - 1 ? 0.45 : 1 }}
              >
                5 →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Chart + decision desk ───────────────────────────── */}
      <div style={{ minWidth: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 10 }}>
        <div className="workspace-card" style={{ minWidth: 0, overflow: "hidden" }}>
          {chartSymbol ? (
            <ChartPanel key={chartSymbol} symbol={chartSymbol}
              latestClose={visibleItems.find(i => i.symbol === chartSymbol)?.close ?? activeWl?.items.find(i => i.symbol === chartSymbol)?.close}
              watchlistName={activeWl?.name ?? null}
              planValid={selectedPlanValid}
              plan={selectedPlan}
              planSummary={selectedPlanValid && selectedPlan ? `${selectedPlan.setupType} plan: entry ${selectedPlan.entry}, stop ${selectedPlan.stop}, target ${selectedPlan.target}.` : undefined}
              onOpenChart={(sym) => router.push(chartHref(sym))}
              onOpenPlan={() => setShowTradePlan(true)}
              onStepSymbol={moveSelection} />
          ) : (
            <div style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <EmptyState
                title="Click any stock to load its chart"
                description="Use the watchlist to save symbols, add notes, and open charts when you want more context."
              />
            </div>
          )}
        </div>

        <div className="workspace-card workspace-card-muted" style={{ minWidth: 0, overflow: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div className="workspace-card-title">Decision desk</div>
              <div className="caption">{selectedItem?.symbol ?? "Select a symbol"} · {selectedSetup?.label ?? "No setup"}</div>
            </div>
            <button className="workspace-chip-button" onClick={() => setShowTradePlan(true)} disabled={!selectedItem} style={{ opacity: selectedItem ? 1 : 0.5 }}>
              Expand
            </button>
          </div>

          {selectedItem && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {selectedMetrics.map((metric) => (
                  <div key={metric.label} style={{ padding: "8px 9px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="label" style={{ marginBottom: 3 }}>{metric.label}</div>
                    <div className="mono" style={{ fontSize: 12, fontWeight: 700, color: metric.tone }}>{metric.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <button className={`workspace-chip-button${selectedPlanValid ? " active" : ""}`} onClick={() => moveSelectedLifecycle("Ready")} disabled={!selectedPlanValid} style={{ justifyContent: "center", opacity: selectedPlanValid ? 1 : 0.5 }}>
                  Ready
                </button>
                <button className="workspace-chip-button" onClick={() => void markSelectedReviewLater()} style={{ justifyContent: "center" }}>
                  Review later
                </button>
                <button className="workspace-chip-button" onClick={() => moveSelectedLifecycle("Invalidated")} style={{ justifyContent: "center", color: "var(--loss)" }}>
                  Invalidated
                </button>
                <button className="workspace-chip-button" onClick={() => selectedItem && updateItemMeta(selectedItem.symbol, { pinned: !selectedItemMeta.pinned })} style={{ justifyContent: "center" }}>
                  {selectedItemMeta.pinned ? "Unpin" : "Pin"}
                </button>
              </div>

              <TradePlanCard
                plan={selectedPlan}
                selectedItem={selectedItem}
                onChange={saveSelectedPlan}
                onLifecycle={moveSelectedLifecycle}
              />
            </>
          )}

          {!selectedItem && (
            <EmptyState
              title="No symbol selected"
              description="Pick a row from the queue to plan the trade before you open an order ticket."
            />
          )}
        </div>
      </div>

      {showTradePlan && (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: "fixed", inset: 0, zIndex: 80, background: "var(--overlay)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
          onClick={() => setShowTradePlan(false)}
        >
          <div
            className="workspace-card"
            style={{ width: "min(520px, 100%)", maxHeight: "85vh", overflow: "auto", padding: 16 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
              <div>
                <div className="workspace-card-title">Trade plan</div>
                <div className="caption">{selectedItem?.symbol ?? "Select a stock first"}</div>
              </div>
              <button className="workspace-chip-button" onClick={() => setShowTradePlan(false)}>Close</button>
            </div>
            <TradePlanCard
              plan={selectedPlan}
              selectedItem={selectedItem}
              onChange={(nextPlan) => {
                saveSelectedPlan(nextPlan);
                showToast(isTradePlanValid(nextPlan) ? "Plan created" : "Plan saved");
              }}
              onLifecycle={moveSelectedLifecycle}
            />
          </div>
        </div>
      )}

      </div>
    </div>
  );
}

export default function WatchlistPage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <div style={{ width: 24, height: 24, borderRadius: "50%", border: "2px solid var(--surface-3)", borderTopColor: "var(--accent)", animation: "spin 1s linear infinite" }}>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    }>
      <WatchlistContent />
    </Suspense>
  );
}
