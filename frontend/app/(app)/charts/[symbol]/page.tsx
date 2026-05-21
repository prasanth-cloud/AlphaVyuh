"use client";

import { use, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Activity, Bell, BookmarkPlus, Check, Eye, EyeOff, Lock, Magnet, Minus, MoveRight, MousePointer2, PencilLine, RectangleHorizontal, RotateCcw, RotateCw, Save, SlidersHorizontal, TrendingDown, TrendingUp, Type, Unlock, Waves } from "lucide-react";
import type { LogicalRange } from "lightweight-charts";
import type {
  CandleBar, CandlesResponse, Drawing, Fundamentals, JournalEntry, LiveQuote, OrderResult, PortfolioPosition, PriceAlert, Watchlist,
} from "@/lib/api";
import {
  getCandles, getCandlesLive, getIndicators, getDrawings, saveDrawing,
  getChartLayout, saveChartLayout, saveDefaultChartLayout, getWatchlists, addToWatchlist,
  getFundamentals, getPlanStatus, getQuote, getQuoteLive, getBrokerStatus, getPortfolio,
  getPriceAlerts, createPriceAlert, deletePriceAlert, deleteDrawing, updateDrawing,
  closePosition, updateJournalEntry, getJournalEntries, liveQuotePollingEnabled, createFeedbackReport,
  streamLiveQuotes, isMockMode, prefetchCandles, prefetchIndicators,
} from "@/lib/api";
import SymbolSearch from "@/components/charts/SymbolSearch";
import OrderModal from "@/components/charts/OrderModal";
import ChartTimeframeDropdown from "@/components/charts/ChartTimeframeDropdown";
import { DataProvenanceBadge, EyebrowLabel, Num } from "@/components/ui";
import { trackEvent } from "@/lib/analytics";
import type { IndicatorData, IchimokuPoint, ChartDisplayType, ChartHandle } from "@/components/charts/CandlestickChart";
import {
  formatChartCoverageRange,
  formatChartGranularity,
  getCoverageAvailabilityMessage,
  getRangeAvailabilityMessage,
  getWatchlistChartRequest,
  type WatchlistChartTimeframe,
} from "@/lib/watchlist-chart-range";
import { formatMarketDataSource } from "@/lib/data-copy";
import { describeMarketDataError } from "@/lib/data-errors";
import { buildChartPlanDraft } from "@/lib/chart-plan-handoff";
import { accountDataErrorMessage } from "@/lib/account-data-status";

type LinePoint = { time: string; value: number };
type MACDPoint = { time: string; macd: number | null; signal: number | null; histogram: number | null };
type StochPoint = { time: string; k: number; d: number | null };
type BrokerStatus = Awaited<ReturnType<typeof getBrokerStatus>>;
type SymbolReviewContext = {
  closed: number;
  reviewed: number;
  winRate: number | null;
  latestLesson: string | null;
  lastSetup: string | null;
  entries: JournalEntry[];
};

type ChartDrawing = {
  id: string;
  tool: DrawingTool;
  p1: { time: string; price: number };
  p2: { time: string; price: number };
  p3?: { time: string; price: number };
  color: string;
  text?: string;
  locked?: boolean;
  hidden?: boolean;
};

type PlaybookItem = {
  key: string;
  label: string;
  status: "ready" | "watch" | "missing";
  detail: string;
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
  { id: "ema20",  label: "EMA 20",  color: "#f4f7fb", bg: "rgba(244,247,251,0.10)" },
  { id: "ema50",  label: "EMA 50",  color: "#bac4d1", bg: "rgba(186,196,209,0.10)" },
  { id: "ema200", label: "EMA 200", color: "#7a8695", bg: "rgba(122,134,149,0.12)" },
  { id: "sma50",  label: "SMA 50",  color: "#94a3b8", bg: "rgba(148,163,184,0.10)" },
  { id: "sma200", label: "SMA 200", color: "#64748b", bg: "rgba(100,116,139,0.12)" },
  { id: "vwap",   label: "VWAP",    color: "#d6dce5", bg: "rgba(214,220,229,0.10)" },
  { id: "rsi",    label: "RSI",     color: "#f4f7fb", bg: "rgba(244,247,251,0.10)" },
  { id: "macd",   label: "MACD",    color: "#bac4d1", bg: "rgba(186,196,209,0.10)" },
  { id: "volume", label: "Volume", color: "#9ca3af", bg: "rgba(156,163,175,0.10)" },
  { id: "bb",     label: "Bollinger Bands", color: "#8b96a6", bg: "rgba(139,150,166,0.10)" },
];

type DrawingTool = "Trendline" | "Ray" | "Horizontal" | "HorizontalRay" | "Rectangle" | "Fib" | "LongPosition" | "ShortPosition" | "Text";
const FULL_CHART_DRAWING_TOOLS: DrawingTool[] = ["Trendline", "Horizontal", "HorizontalRay", "Ray", "Rectangle", "Fib", "Text", "LongPosition", "ShortPosition"];
const DRAWING_DEFAULT_COLOR = "#f4f7fb";
type ChartDataCacheEntry = {
  data: CandlesResponse;
  indicatorData: IndicatorData;
  rsiData: LinePoint[];
  macdData: MACDPoint[];
  stochData: StochPoint[];
  atrData: LinePoint[];
  loadedAt: number;
};

const DRAW_TOOL_META: Record<DrawingTool, { label: string; short: string; icon: typeof PencilLine; hint: string }> = {
  Trendline: { label: "Trendline", short: "T", icon: PencilLine, hint: "Two-point trendline" },
  Ray: { label: "Ray", short: "R", icon: MoveRight, hint: "Extends to the right edge" },
  Horizontal: { label: "Horizontal line", short: "H", icon: Minus, hint: "Full-width support/resistance" },
  HorizontalRay: { label: "H-Ray", short: "J", icon: MoveRight, hint: "Horizontal from anchor to the right" },
  Rectangle: { label: "Rectangle / zone", short: "Z", icon: RectangleHorizontal, hint: "Supply / demand box" },
  Fib: { label: "Fibonacci retracement", short: "F", icon: Waves, hint: "Fibonacci retracement" },
  LongPosition: { label: "Long position", short: "L", icon: TrendingUp, hint: "Entry, stop, target risk box" },
  ShortPosition: { label: "Short position", short: "S", icon: TrendingDown, hint: "Entry, stop, target risk box" },
  Text: { label: "Text note", short: "N", icon: Type, hint: "Chart annotation" },
};

const chartDataCache = new Map<string, ChartDataCacheEntry>();
const CHART_CACHE_TTL_MS = 60_000;
const CHART_TYPE_STORAGE_KEY = "alphavyuh-chart-type";

function normalizeChartType(value: string | null | undefined): ChartDisplayType | null {
  return value === "bars" || value === "line" || value === "candles" ? value : null;
}

function readStoredChartType(fallback: ChartDisplayType = "candles"): ChartDisplayType {
  if (typeof window === "undefined") return fallback;
  return normalizeChartType(window.localStorage.getItem(CHART_TYPE_STORAGE_KEY)) ?? fallback;
}

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

function computeSmaLine(candles: CandleBar[], period: number): LinePoint[] {
  const out: LinePoint[] = [];
  let sum = 0;
  for (let index = 0; index < candles.length; index += 1) {
    sum += candles[index].close;
    if (index >= period) sum -= candles[index - period].close;
    if (index + 1 >= period) {
      out.push({ time: candles[index].time, value: Number((sum / period).toFixed(4)) });
    }
  }
  return out;
}

function cloneDrawings(drawings: ChartDrawing[]): ChartDrawing[] {
  return drawings.map((item) => ({
    ...item,
    p1: { ...item.p1 },
    p2: { ...item.p2 },
    p3: item.p3 ? { ...item.p3 } : undefined,
  }));
}

function isPositionDrawingTool(tool: DrawingTool): tool is "LongPosition" | "ShortPosition" {
  return tool === "LongPosition" || tool === "ShortPosition";
}

function buildPositionDrawingPoints(
  tool: "LongPosition" | "ShortPosition",
  entry: { time: string; price: number },
  stopDraft: { time: string; price: number },
) {
  let stopPrice = stopDraft.price;
  if (tool === "LongPosition" && stopPrice >= entry.price) {
    stopPrice = entry.price * 0.98;
  }
  if (tool === "ShortPosition" && stopPrice <= entry.price) {
    stopPrice = entry.price * 1.02;
  }
  const risk = Math.max(Math.abs(entry.price - stopPrice), entry.price * 0.0025);
  const targetPrice = tool === "LongPosition" ? entry.price + risk * 2 : entry.price - risk * 2;
  return {
    p2: { time: stopDraft.time, price: stopPrice },
    p3: { time: stopDraft.time, price: Math.max(0.01, targetPrice) },
  };
}

function getDrawingToolType(tool: DrawingTool): string {
  if (tool === "LongPosition") return "long_position";
  if (tool === "ShortPosition") return "short_position";
  return tool.toLowerCase();
}

function getPersistedDrawingPoints(drawing: ChartDrawing) {
  if (drawing.tool === "Text") {
    return [{ time: drawing.p1.time, price: drawing.p1.price }, { time: drawing.p1.time, price: drawing.p1.price }];
  }
  const points = [{ time: drawing.p1.time, price: drawing.p1.price }, { time: drawing.p2.time, price: drawing.p2.price }];
  if (isPositionDrawingTool(drawing.tool) && drawing.p3) {
    points.push({ time: drawing.p3.time, price: drawing.p3.price });
  }
  return points;
}

function normalizeDrawingColor(color?: string | null): string {
  const value = color?.trim().toLowerCase();
  if (!value) return DRAWING_DEFAULT_COLOR;

  const invisibleOnDark = new Set([
    "#000",
    "#000000",
    "black",
    "rgb(0,0,0)",
    "rgb(0, 0, 0)",
    "rgba(0,0,0,1)",
    "rgba(0, 0, 0, 1)",
  ]);

  return invisibleOnDark.has(value) ? DRAWING_DEFAULT_COLOR : color!;
}

function findNearestCandlePrice(
  candles: CandleBar[] | undefined,
  time: string,
  price: number,
): number {
  if (!candles?.length) return price;
  let nearest = candles[0];
  let bestTimeDelta = Number.POSITIVE_INFINITY;
  const targetMs = new Date(time).getTime();
  for (const candle of candles) {
    const delta = Math.abs(new Date(candle.time).getTime() - targetMs);
    if (delta < bestTimeDelta) {
      bestTimeDelta = delta;
      nearest = candle;
    }
  }
  const levels = [nearest.open, nearest.high, nearest.low, nearest.close];
  return levels.reduce((best, candidate) => (
    Math.abs(candidate - price) < Math.abs(best - price) ? candidate : best
  ), levels[0]);
}

function constrainDrawingPoint(
  tool: DrawingTool,
  start: { x: number; y: number },
  point: { x: number; y: number },
  shiftKey: boolean,
): { x: number; y: number } {
  if (tool === "Text") return start;
  if (tool === "Horizontal" || tool === "HorizontalRay") return { x: point.x, y: start.y };
  if (!shiftKey) return point;

  const dx = point.x - start.x;
  const dy = point.y - start.y;
  if (tool === "Rectangle") {
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    return {
      x: start.x + Math.sign(dx || 1) * size,
      y: start.y + Math.sign(dy || 1) * size,
    };
  }

  const distance = Math.hypot(dx, dy);
  if (!distance) return point;
  const snappedAngle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return {
    x: start.x + Math.cos(snappedAngle) * distance,
    y: start.y + Math.sin(snappedAngle) * distance,
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ChartPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: routeSymbol } = use(params);
  const symbol = routeSymbol.toUpperCase();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sourcePage = searchParams.get("from");
  const sourceWatchlist = searchParams.get("watchlist");
  const sourceWatchlistId = searchParams.get("watchlistId");
  const fullChartMode = searchParams.get("full") === "1";
  const initialDrawMode = searchParams.get("draw");
  const initialChartType = normalizeChartType(searchParams.get("type"));

  const [rangeLabel, setRangeLabel] = useState<WatchlistChartTimeframe>("1Y");
  const [timeframe, setTimeframe] = useState<"D" | "W" | "M">("D");
  const [rangeNote, setRangeNote] = useState<string | null>(null);
  const [timeframeMessage, setTimeframeMessage] = useState("");
  const [liveMode, setLiveMode] = useState(false);
  const [chartType, setChartType] = useState<ChartDisplayType>(() => initialChartType ?? readStoredChartType());
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    if (!fullChartMode) return;
    trackEvent("full_chart_opened", { symbol, timeframe });
  }, [fullChartMode, symbol, timeframe]);

  useEffect(() => {
    const nextType = normalizeChartType(searchParams.get("type"));
    if (nextType && nextType !== chartType) setChartType(nextType);
  }, [chartType, searchParams]);

  useEffect(() => {
    window.localStorage.setItem(CHART_TYPE_STORAGE_KEY, chartType);
  }, [chartType]);

  useEffect(() => {
    const current = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    setTheme(current);
    const syncTheme = (event: Event) => {
      const next = (event as CustomEvent<"dark" | "light">).detail ?? document.documentElement.dataset.theme;
      setTheme(next === "light" ? "light" : "dark");
    };
    window.addEventListener("alphavyuh:theme-changed", syncTheme);
    return () => window.removeEventListener("alphavyuh:theme-changed", syncTheme);
  }, []);

  const [data, setData] = useState<CandlesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [liveQuote, setLiveQuote] = useState<LiveQuote | null>(null);
  const [liveQuoteUpdatedAt, setLiveQuoteUpdatedAt] = useState<string | null>(null);

  // Compare symbol
  const [compareSymbol, setCompareSymbol] = useState("");
  const [compareInput, setCompareInput] = useState("");
  const [showCompareInput, setShowCompareInput] = useState(false);
  const [compareData, setCompareData] = useState<CandlesResponse | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareRetryNonce, setCompareRetryNonce] = useState(0);

  // Price alerts
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);
  const [priceAlertsError, setPriceAlertsError] = useState<string | null>(null);
  const [alertCondition, setAlertCondition] = useState<"above" | "below">("above");
  const [alertPrice, setAlertPrice] = useState("");
  const [alertNote, setAlertNote] = useState("");
  const [alertSaving, setAlertSaving] = useState(false);
  const [alertMsg, setAlertMsg] = useState("");
  const [quickAlertMsg, setQuickAlertMsg] = useState("");

  const [activeIndicators, setActiveIndicators] = useState<string[]>(["ema20", "ema50"]);
  const [layoutMsg, setLayoutMsg] = useState("");
  const [activeDrawingTool, setActiveDrawingTool] = useState<DrawingTool | null>(null);
  const [, setDrawings] = useState<Drawing[]>([]);
  const [drawnLines, setDrawnLines] = useState<ChartDrawing[]>([]);
  const [drawingsError, setDrawingsError] = useState<string | null>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<ChartDrawing[][]>([]);
  const [redoStack, setRedoStack] = useState<ChartDrawing[][]>([]);
  const [snapToPrice, setSnapToPrice] = useState(true);
  const chartHandleRef = useRef<ChartHandle | null>(null);
  const dataRef = useRef<CandlesResponse | null>(null);
  const lastBaseChartKeyRef = useRef<string | null>(null);
  const loadedDrawingsKeyRef = useRef<string | null>(null);
  const loadedPriceAlertsSymbolRef = useRef<string | null>(null);

  const [indicatorData, setIndicatorData] = useState<IndicatorData>({});
  const [indicatorError, setIndicatorError] = useState<string | null>(null);
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
  const [watchlistsLoading, setWatchlistsLoading] = useState(false);
  const [watchlistsError, setWatchlistsError] = useState<string | null>(null);
  const [watchlists, setWatchlists] = useState<{ id: string; name: string }[]>([]);
  const [sourceQueue, setSourceQueue] = useState<Watchlist | null>(null);
  const [sourceQueueError, setSourceQueueError] = useState<string | null>(null);

  // Fundamentals & Technicals accordions
  const [fundamentals, setFundamentals] = useState<Fundamentals | null>(null);
  const [fundamentalsLoading, setFundamentalsLoading] = useState(false);
  const [fundamentalsError, setFundamentalsError] = useState<string | null>(null);
  const [showReviewPanel, setShowReviewPanel] = useState(false);
  const [showPositionsPanel, setShowPositionsPanel] = useState(true);
  const [showFundamentals, setShowFundamentals] = useState(false);
  const [showTechnicals, setShowTechnicals] = useState(true);

  // Order modal
  const [showOrder, setShowOrder] = useState(false);
  const [orderSide, setOrderSide] = useState<"buy" | "sell">("buy");
  const [tradePlan, setTradePlan] = useState<{ entry: string; stop: string; target: string }>({ entry: "", stop: "", target: "" });
  const [orderToast, setOrderToast] = useState<{ message: string; journalId: string | null; broker: string; nextActions?: string[]; riskReward?: number | null } | null>(null);
  const [symbolPositions, setSymbolPositions] = useState<PortfolioPosition[]>([]);
  const [symbolPositionsError, setSymbolPositionsError] = useState<string | null>(null);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [closeBusyId, setCloseBusyId] = useState<string | null>(null);
  const [manageBusyId, setManageBusyId] = useState<string | null>(null);
  const [activeManagedPositionId, setActiveManagedPositionId] = useState<string | null>(null);
  const [closeDraft, setCloseDraft] = useState<Record<string, { price: string; reason: string; stop: string; target: string }>>({});

  // Broker status
  const [brokerConnected, setBrokerConnected] = useState(false);
  const [brokerStatus, setBrokerStatus] = useState<BrokerStatus | null>(null);
  const [brokerStatusError, setBrokerStatusError] = useState<string | null>(null);
  const [symbolReview, setSymbolReview] = useState<SymbolReviewContext>({
    closed: 0,
    reviewed: 0,
    winRate: null,
    latestLesson: null,
    lastSetup: null,
    entries: [],
  });
  const [symbolReviewError, setSymbolReviewError] = useState<string | null>(null);

  // Plan (for indicator gating)
  const [userPlan, setUserPlan] = useState<string>("free");
  const [symbolCurrency, setSymbolCurrency] = useState<string>("INR");
  const [planUpgradeToast, setPlanUpgradeToast] = useState("");
  const FREE_INDICATORS = INDICATOR_CONFIG.map((indicator) => indicator.id);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Toolbar dropdowns
  const [showDrawMenu, setShowDrawMenu] = useState(false);
  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false);
  const [planHandoffConfirmOpen, setPlanHandoffConfirmOpen] = useState(false);
  const indicatorMenuRef = useRef<HTMLDivElement>(null);
  const drawMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (indicatorMenuRef.current && !indicatorMenuRef.current.contains(e.target as Node)) setShowIndicatorMenu(false);
      if (drawMenuRef.current && !drawMenuRef.current.contains(e.target as Node)) setShowDrawMenu(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Overlay drawing state
  const overlayRef = useRef<HTMLDivElement>(null);
  const drawingStartRef = useRef<{ x: number; y: number } | null>(null);
  const [drawingPreview, setDrawingPreview] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [dragState, setDragState] = useState<{
    drawingId: string;
    mode: "point" | "whole";
    point?: "p1" | "p2" | "p3";
    startX: number;
    startY: number;
    original: ChartDrawing;
  } | null>(null);
  const [positionDragState, setPositionDragState] = useState<{
    positionId: string;
    field: "stop" | "target";
  } | null>(null);
  const [planDragState, setPlanDragState] = useState<{
    field: "entry" | "stop" | "target";
  } | null>(null);
  const [textEditor, setTextEditor] = useState<{ drawingId: string | null; value: string; x: number; y: number; isNew: boolean } | null>(null);

  useEffect(() => {
    if (initialDrawMode === "trendline") {
      setActiveDrawingTool("Trendline");
    } else if (initialDrawMode === "hline" || initialDrawMode === "horizontal") {
      setActiveDrawingTool("Horizontal");
    }
  }, [initialDrawMode]);

  const updateDrawingsWithHistory = useCallback((mutator: (current: ChartDrawing[]) => ChartDrawing[]) => {
    setDrawnLines((current) => {
      const snapshot = cloneDrawings(current);
      const next = mutator(current);
      setUndoStack((stack) => [...stack.slice(-39), snapshot]);
      setRedoStack([]);
      return next;
    });
  }, []);

  const showDrawingPersistenceError = useCallback((error: unknown, fallback: string) => {
    setLayoutMsg(error instanceof Error ? error.message : fallback);
    setTimeout(() => setLayoutMsg(""), 5000);
  }, []);

  const persistEditedDrawing = useCallback(async (drawing: ChartDrawing) => {
    try {
      const saved = await updateDrawing(symbol, drawing.id, {
        tool_type: getDrawingToolType(drawing.tool),
        points: getPersistedDrawingPoints(drawing),
        style: { color: drawing.color, text: drawing.text ?? null, locked: drawing.locked ?? false, hidden: drawing.hidden ?? false },
        timeframe,
      });
      setDrawings((prev) => prev.map((item) => item.id === drawing.id ? saved : item));
      setDrawnLines((prev) => prev.map((item) => item.id === drawing.id ? { ...item, id: saved.id } : item));
      setSelectedDrawingId(saved.id);
    } catch (error) {
      showDrawingPersistenceError(error, "Chart drawing changes could not be saved.");
    }
  }, [showDrawingPersistenceError, symbol, timeframe]);

  const getSnappedPrice = useCallback((time: string, price: number) => {
    if (!snapToPrice) return price;
    return findNearestCandlePrice(data?.candles, time, price);
  }, [data?.candles, snapToPrice]);

  const applyIndicatorPayload = useCallback((resp: Awaited<ReturnType<typeof getIndicators>> | null, candles: CandleBar[] = []) => {
    const ind = (resp?.indicators ?? {}) as Record<string, unknown[]>;
    const nextIndicatorData: IndicatorData = {
      ema20:    ind.ema20    as LinePoint[] | undefined,
      ema50:    ind.ema50    as LinePoint[] | undefined,
      ema200:   ind.ema200   as LinePoint[] | undefined,
      sma50:    computeSmaLine(candles, 50),
      sma200:   computeSmaLine(candles, 200),
      vwap:     ind.vwap     as LinePoint[] | undefined,
      bb:       ind.bb       as never,
      ichimoku: ind.ichimoku as IchimokuPoint[] | undefined,
    };
    const nextRsi = (ind.rsi as LinePoint[] | undefined) ?? [];
    const nextMacd = (ind.macd as MACDPoint[] | undefined) ?? [];
    const nextStoch = (ind.stoch as StochPoint[] | undefined) ?? [];
    const nextAtr = (ind.atr as LinePoint[] | undefined) ?? [];

    setIndicatorData(nextIndicatorData);
    setRsiData(nextRsi);
    setMacdData(nextMacd);
    setStochData(nextStoch);
    setAtrData(nextAtr);

    return { nextIndicatorData, nextRsi, nextMacd, nextStoch, nextAtr };
  }, []);

  // Load compare symbol data
  useEffect(() => {
    if (!compareSymbol) {
      setCompareData(null);
      setCompareError(null);
      return;
    }
    let cancelled = false;
    const activeCompareSymbol = compareSymbol.trim().toUpperCase();
    const request = getWatchlistChartRequest(rangeLabel);
    setCompareError(null);
    getCandles(compareSymbol, {
      limit: request.limit,
      timeframe: request.timeframe,
      from_date: request.from_date,
      to_date: request.to_date,
    })
      .then((nextData) => {
        if (cancelled) return;
        setCompareData(nextData);
        setCompareError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setCompareData(null);
        setCompareError(error instanceof Error && error.message.trim()
          ? error.message
          : `Compare data for ${activeCompareSymbol} is temporarily unavailable.`);
      });
    return () => {
      cancelled = true;
    };
  }, [compareRetryNonce, compareSymbol, rangeLabel]);

  // Load chart data
  useEffect(() => {
    let cancelled = false;
    const request = getWatchlistChartRequest(rangeLabel);
    if (request.timeframe !== timeframe) setTimeframe(request.timeframe);
    const overlayInds = activeIndicators.filter(i => ["ema20", "ema50", "ema200", "bb", "vwap"].includes(i));
    const panelInds = activeIndicators.filter(i => ["rsi", "macd"].includes(i));
    const allInds = Array.from(new Set([...overlayInds, ...panelInds]));
    const baseCacheKey = [symbol, rangeLabel, request.timeframe, request.from_date, request.to_date, request.limit, liveMode ? "live" : "eod"].join(":");
    const cacheKey = [baseCacheKey, allInds.sort().join(",")].join(":");
    const cached = chartDataCache.get(cacheKey);
    const freshCached = cached && Date.now() - cached.loadedAt < CHART_CACHE_TTL_MS ? cached : null;
    const canKeepVisibleChart = dataRef.current && lastBaseChartKeyRef.current === baseCacheKey;

    setLoading(true);
    setError("");
    if (freshCached) {
      setData(freshCached.data);
      lastBaseChartKeyRef.current = baseCacheKey;
      setLegendBar(null);
      setRangeNote(getCoverageAvailabilityMessage(freshCached.data.coverage, request) ?? getRangeAvailabilityMessage(freshCached.data.candles ?? [], request));
      setIndicatorError(null);
      setIndicatorData(freshCached.indicatorData);
      setRsiData(freshCached.rsiData);
      setMacdData(freshCached.macdData);
      setStochData(freshCached.stochData);
      setAtrData(freshCached.atrData);
    } else if (canKeepVisibleChart) {
      setRangeNote(null);
      setIndicatorData({});
      setRsiData([]);
      setMacdData([]);
      setStochData([]);
      setAtrData([]);
    } else {
      setData(null);
      setRangeNote(null);
      setRsiData([]);
      setMacdData([]);
      setStochData([]);
      setAtrData([]);
      setIndicatorData({});
    }
    if (!allInds.length) setIndicatorError(null);

    const candlesParams = {
      limit: request.limit,
      timeframe: request.timeframe,
      from_date: request.from_date,
      to_date: request.to_date,
    };
    const candlesPromise = liveMode
      ? getCandlesLive(symbol, { limit: Math.min(request.limit, 1000), timeframe: request.timeframe }).catch(() => {
          if (!cancelled) setLiveMode(false);
          return getCandles(symbol, candlesParams);
        })
      : getCandles(symbol, candlesParams);
    const indicatorsPromise = allInds.length
      ? getIndicators(symbol, allInds, request.timeframe)
        .then((payload) => ({ payload, error: null as string | null }))
        .catch((error) => ({
          payload: null,
          error: error instanceof Error && error.message.trim()
            ? error.message
            : "Chart indicators are temporarily unavailable.",
        }))
      : Promise.resolve({ payload: null, error: null as string | null });

    Promise.all([candlesPromise, indicatorsPromise])
      .then(([nextData, indicatorsResp]) => {
        if (cancelled) return;
        setData(nextData);
        lastBaseChartKeyRef.current = baseCacheKey;
        setLegendBar(null);
        setRangeNote(getCoverageAvailabilityMessage(nextData.coverage, request) ?? getRangeAvailabilityMessage(nextData.candles ?? [], request));
        setIndicatorError(indicatorsResp.error);
        const { nextIndicatorData, nextRsi, nextMacd, nextStoch, nextAtr } = applyIndicatorPayload(indicatorsResp.payload, nextData.candles ?? []);
        if (!indicatorsResp.error) {
          chartDataCache.set(cacheKey, {
            data: nextData,
            indicatorData: nextIndicatorData,
            rsiData: nextRsi,
            macdData: nextMacd,
            stochData: nextStoch,
            atrData: nextAtr,
            loadedAt: Date.now(),
          });
        }
      })
      .catch(e => {
        if (!cancelled) setError(describeMarketDataError(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeIndicators, applyIndicatorPayload, liveMode, rangeLabel, symbol, timeframe]);

  // Auto-refresh every 5 minutes in live mode
  useEffect(() => {
    if (!liveMode) return;
    const interval = setInterval(() => {
      const request = getWatchlistChartRequest(rangeLabel);
      getCandlesLive(symbol, { limit: Math.min(request.limit, 1000), timeframe: request.timeframe })
        .then(d => { setData(d); setLegendBar(null); })
        .catch(() => {});
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [liveMode, rangeLabel, symbol]);

  // Load saved layout + plan + alerts
  useEffect(() => {
    getChartLayout(symbol).then(layout => {
      if (layout.timeframe === "D" || layout.timeframe === "W" || layout.timeframe === "M") {
        setTimeframe(layout.timeframe);
        setRangeLabel(layout.timeframe === "D" ? "1Y" : layout.timeframe === "W" ? "3Y" : "10Y");
      }
      if (layout.indicators?.length) setActiveIndicators(layout.indicators);
    }).catch((error) => {
      setLayoutMsg(error instanceof Error ? error.message : "Chart layout is temporarily unavailable.");
      setTimeout(() => setLayoutMsg(""), 3000);
    });
    getPlanStatus().then(s => setUserPlan(s.plan)).catch(() => {});
    getQuote(symbol).then(q => { if (q?.currency) setSymbolCurrency(q.currency); }).catch(() => {});
    getBrokerStatus()
      .then(s => {
        setBrokerStatus(s);
        setBrokerConnected(Boolean(s.connected && !s.token_expired));
        setBrokerStatusError(null);
      })
      .catch((error) => {
        setBrokerStatus(null);
        setBrokerConnected(false);
        setBrokerStatusError(accountDataErrorMessage(error, "Broker status is temporarily unavailable. Existing broker access is not being treated as disconnected."));
      });
    const requestSymbol = symbol.toUpperCase();
    setPriceAlertsError(null);
    getPriceAlerts()
      .then(alerts => {
        loadedPriceAlertsSymbolRef.current = requestSymbol;
        setPriceAlerts(alerts.filter(a => a.symbol.toUpperCase() === requestSymbol && a.is_active));
      })
      .catch((error) => {
        if (loadedPriceAlertsSymbolRef.current !== requestSymbol) {
          setPriceAlerts([]);
        }
        setPriceAlertsError(error instanceof Error ? error.message : "Price alerts are temporarily unavailable.");
      });
  }, [symbol]);

  useEffect(() => {
    setLiveQuote(null);
    setLiveQuoteUpdatedAt(null);
    if (!liveMode && !liveQuotePollingEnabled) return;
    let cancelled = false;
    let streamConnected = false;

    const stopStream = streamLiveQuotes(
      [symbol],
      (ticks) => {
        if (cancelled) return;
        const quote = ticks.find((tick) => tick.symbol === symbol.toUpperCase());
        if (!quote || quote.close == null) return;
        setLiveQuote(quote);
        if (quote.currency) setSymbolCurrency(quote.currency);
        setLiveQuoteUpdatedAt(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }));
      },
      (status) => {
        streamConnected = status.connected;
      }
    );

    async function refreshLiveQuote() {
      if (streamConnected) return;
      const quote = await getQuoteLive(symbol);
      if (cancelled || !quote) return;
      setLiveQuote(quote);
      if (quote.currency) setSymbolCurrency(quote.currency);
      setLiveQuoteUpdatedAt(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }));
    }

    refreshLiveQuote();
    const id = window.setInterval(refreshLiveQuote, 30_000);
    return () => {
      cancelled = true;
      stopStream();
      window.clearInterval(id);
    };
  }, [liveMode, symbol]);

  const loadSourceQueue = useCallback(async (force = false) => {
    if (sourcePage !== "watchlist" || (!sourceWatchlistId && !sourceWatchlist)) {
      setSourceQueue(null);
      setSourceQueueError(null);
      return;
    }
    try {
      const lists = await getWatchlists({ force });
      const matched = sourceWatchlistId
        ? lists.find((watchlist) => watchlist.id === sourceWatchlistId)
        : lists.find((watchlist) => watchlist.name === sourceWatchlist);
      setSourceQueue(matched ?? null);
      setSourceQueueError(null);
    } catch (error) {
      setSourceQueue(null);
      setSourceQueueError(error instanceof Error ? error.message : "Watchlist data is temporarily unavailable.");
    }
  }, [sourcePage, sourceWatchlist, sourceWatchlistId]);

  useEffect(() => {
    loadSourceQueue();
  }, [loadSourceQueue]);

  useEffect(() => {
    let cancelled = false;
    setSymbolReviewError(null);
    getJournalEntries({ limit: 100, symbol }).then((journal) => {
      if (cancelled) return;
      const closed = journal.entries.filter((entry) => entry.status === "closed");
      const reviewed = closed.filter((entry) => Boolean(entry.lessons?.trim()));
      const wins = closed.filter((entry) => (entry.pnl ?? 0) > 0).length;
      setSymbolReview({
        closed: closed.length,
        reviewed: reviewed.length,
        winRate: closed.length ? (wins / closed.length) * 100 : null,
        latestLesson: reviewed[0]?.lessons?.trim() ?? null,
        lastSetup: journal.entries[0]?.setup_type ?? null,
        entries: journal.entries,
      });
      setSymbolReviewError(null);
    }).catch((error) => {
      if (cancelled) return;
      setSymbolReview({ closed: 0, reviewed: 0, winRate: null, latestLesson: null, lastSetup: null, entries: [] });
      setSymbolReviewError(accountDataErrorMessage(error, "Journal review context is temporarily unavailable."));
    });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const loadSymbolPositions = useCallback(async () => {
    setPositionsLoading(true);
    setSymbolPositionsError(null);
    try {
      const portfolio = await getPortfolio();
      const relevant = (portfolio.positions || []).filter((position) => position.symbol === symbol);
      setSymbolPositions(relevant);
      setCloseDraft((prev) => {
        const next = { ...prev };
        for (const position of relevant) {
          if (!next[position.id]) {
            next[position.id] = {
              price: String(position.current_price || data?.latest?.close || position.entry_price),
              reason: "",
              stop: position.stop_loss != null ? String(position.stop_loss) : "",
              target: position.target_price != null ? String(position.target_price) : "",
            };
          }
        }
        return next;
      });
    } catch (error) {
      setSymbolPositionsError(error instanceof Error ? error.message : "Portfolio is temporarily unavailable.");
    } finally {
      setPositionsLoading(false);
    }
  }, [data?.latest?.close, symbol]);

  useEffect(() => {
    void loadSymbolPositions();
  }, [loadSymbolPositions]);

  useEffect(() => {
    if (!symbolPositions.length) {
      setActiveManagedPositionId(null);
      return;
    }
    if (!activeManagedPositionId || !symbolPositions.some((position) => position.id === activeManagedPositionId)) {
      setActiveManagedPositionId(symbolPositions[0].id);
    }
  }, [activeManagedPositionId, symbolPositions]);

  useEffect(() => {
    setShowPositionsPanel(symbolPositions.length > 0);
  }, [symbolPositions.length]);

  // Load fundamentals when sidebar fundamentals section is opened
  useEffect(() => {
    if (!showFundamentals || fundamentals?.symbol === symbol) return;
    setFundamentals(null);
    setFundamentalsError(null);
    setFundamentalsLoading(true);
    getFundamentals(symbol)
      .then((next) => {
        if (next) {
          setFundamentals(next);
        } else {
          setFundamentalsError("Fundamentals are temporarily unavailable. Chart and planning tools remain usable.");
        }
      })
      .catch((error) => {
        setFundamentalsError(error instanceof Error ? error.message : "Fundamentals are temporarily unavailable.");
      })
      .finally(() => setFundamentalsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFundamentals, symbol]);

  // Load drawings — parse new price/time format, skip old pixel-ratio format
  useEffect(() => {
    let cancelled = false;
    const requestKey = `${symbol.toUpperCase()}:${timeframe}`;
    setDrawingsError(null);
    getDrawings(symbol, timeframe).then(list => {
      if (cancelled) return;
      loadedDrawingsKeyRef.current = requestKey;
      setDrawings(list);
      const lines: ChartDrawing[] = list.flatMap(d => {
        const pts = d.points as { time?: string; price?: number; x?: number; y?: number }[];
        if (pts.length < 2 || !pts[0].time || pts[0].price == null) return [];
        const toolType = (d.tool_type || "").toLowerCase();
        const tool: DrawingTool =
          toolType === "horizontal" ? "Horizontal" :
          toolType === "horizontalray" || toolType === "hray" ? "HorizontalRay" :
          toolType === "fib" ? "Fib" :
          toolType === "rectangle" ? "Rectangle" :
          toolType === "longposition" || toolType === "long_position" || toolType === "long" ? "LongPosition" :
          toolType === "shortposition" || toolType === "short_position" || toolType === "short" ? "ShortPosition" :
          toolType === "ray" ? "Ray" :
          toolType === "text" ? "Text" :
          "Trendline";
        const p1 = { time: pts[0].time, price: pts[0].price };
        const p2 = { time: pts[1].time ?? pts[0].time, price: pts[1].price ?? pts[0].price };
        const p3 = pts[2]?.time && pts[2].price != null
          ? { time: pts[2].time, price: pts[2].price }
          : isPositionDrawingTool(tool) ? buildPositionDrawingPoints(tool, p1, p2).p3 : undefined;
        return [{
          id: d.id,
          tool,
          p1,
          p2: isPositionDrawingTool(tool) ? buildPositionDrawingPoints(tool, p1, p2).p2 : p2,
          p3,
          color: normalizeDrawingColor((d.style as { color?: string }).color),
          text: (d.style as { text?: string }).text,
          locked: Boolean((d.style as { locked?: boolean }).locked),
          hidden: Boolean((d.style as { hidden?: boolean }).hidden),
        } as ChartDrawing];
      });
      setDrawnLines(lines);
      setUndoStack([]);
      setRedoStack([]);
      setSelectedDrawingId(null);
    }).catch((error) => {
      if (cancelled) return;
      if (loadedDrawingsKeyRef.current !== requestKey) {
        setDrawings([]);
        setDrawnLines([]);
        setSelectedDrawingId(null);
      }
      setDrawingsError(error instanceof Error ? error.message : "Chart drawings are temporarily unavailable.");
    });
    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe]);

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
    await saveChartLayout(symbol, {
      timeframe,
      indicators: activeIndicators,
      drawing_tools: drawnLines.map(item => ({
        id: item.id,
        tool: item.tool,
        color: item.color,
        locked: Boolean(item.locked),
        hidden: Boolean(item.hidden),
      })),
    });
    setLayoutMsg("Saved for this symbol");
    setTimeout(() => setLayoutMsg(""), 2500);
  }

  async function handleSaveDefaultLayout() {
    await saveDefaultChartLayout({
      timeframe,
      indicators: activeIndicators,
      drawing_tools: [],
    });
    setLayoutMsg("Default preset saved");
    setTimeout(() => setLayoutMsg(""), 2500);
  }

  async function handleAddWatchlist(force = false) {
    setWatchlistsLoading(true);
    setWatchlistsError(null);
    setWlMsg("");
    try {
      const wls = await getWatchlists({ force });
      setWatchlists(wls.map(w => ({ id: w.id, name: w.name })));
      setShowWlPicker(true);
      setWatchlistsError(null);
    } catch (error) {
      setWatchlists([]);
      setShowWlPicker(true);
      setWatchlistsError(error instanceof Error ? error.message : "Watchlist data is temporarily unavailable.");
    } finally {
      setWatchlistsLoading(false);
    }
  }

  async function handleCreateAlert() {
    const price = parseFloat(alertPrice);
    if (!price || price <= 0) { setAlertMsg("Enter a valid price"); return; }
    setAlertSaving(true);
    try {
      const created = await createPriceAlert({ symbol, condition: alertCondition, target_price: price, note: alertNote || undefined });
      setPriceAlerts(prev => [created, ...prev]);
      setPriceAlertsError(null);
      setAlertMsg("Alert set!");
      setAlertPrice("");
      setAlertNote("");
      setTimeout(() => { setAlertMsg(""); setShowAlertModal(false); }, 1500);
    } catch (e: unknown) {
      setAlertMsg(e instanceof Error ? e.message : "Failed");
    }
    setAlertSaving(false);
  }

  async function handleQuickAlert(condition: "above" | "below", target: number | null | undefined, note: string) {
    if (target == null || !Number.isFinite(target) || target <= 0) {
      setQuickAlertMsg("Level unavailable");
      setTimeout(() => setQuickAlertMsg(""), 2500);
      return;
    }
    setAlertSaving(true);
    setQuickAlertMsg("");
    try {
      const created = await createPriceAlert({
        symbol,
        condition,
        target_price: Number(target.toFixed(2)),
        note,
      });
      setPriceAlerts(prev => [created, ...prev]);
      setPriceAlertsError(null);
      setQuickAlertMsg(`Alert set ${condition} ${fmtPrice(target, symbolCurrency)}`);
    } catch (e: unknown) {
      setQuickAlertMsg(e instanceof Error ? e.message : "Alert failed");
    } finally {
      setAlertSaving(false);
      setTimeout(() => setQuickAlertMsg(""), 3000);
    }
  }

  async function handleAlertFromSelectedDrawing() {
    if (!selectedDrawing) {
      setQuickAlertMsg("Select a drawing first");
      setTimeout(() => setQuickAlertMsg(""), 2500);
      return;
    }
    const target = isPositionDrawingTool(selectedDrawing.tool)
      ? selectedDrawing.p3?.price ?? selectedDrawing.p1.price
      : selectedDrawing.tool === "Horizontal" || selectedDrawing.tool === "HorizontalRay"
        ? selectedDrawing.p1.price
        : selectedDrawing.p2.price;
    const condition = displayClose != null && target > displayClose ? "above" : "below";
    await handleQuickAlert(
      condition,
      target,
      `${DRAW_TOOL_META[selectedDrawing.tool].label} alert from saved drawing`,
    );
  }

  async function handleDeleteAlert(id: string) {
    try {
      await deletePriceAlert(id);
      setPriceAlerts(prev => prev.filter(a => a.id !== id));
      setPriceAlertsError(null);
    } catch (error) {
      setAlertMsg(error instanceof Error ? error.message : "Price alerts are temporarily unavailable.");
    }
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
    if (planDragState && overlayRef.current) {
      const rect = overlayRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const rawPrice = chartHandleRef.current?.coordinateToPrice(y) ?? null;
      const anchorTime = data?.candles.at(-1)?.time ?? null;
      if (rawPrice != null) {
        const nextPrice = anchorTime && !e.altKey ? getSnappedPrice(anchorTime, rawPrice) : rawPrice;
        setTradePlan((current) => ({
          ...current,
          [planDragState.field]: nextPrice.toFixed(2),
        }));
      }
      return;
    }
    if (positionDragState && overlayRef.current) {
      const rect = overlayRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const rawPrice = chartHandleRef.current?.coordinateToPrice(y) ?? null;
      const anchorTime = data?.candles.at(-1)?.time ?? null;
      if (rawPrice != null) {
        const nextPrice = anchorTime && !e.altKey ? getSnappedPrice(anchorTime, rawPrice) : rawPrice;
        setCloseDraft((prev) => {
          const current = prev[positionDragState.positionId];
          if (!current) return prev;
          return {
            ...prev,
            [positionDragState.positionId]: {
              ...current,
              [positionDragState.field]: nextPrice.toFixed(2),
            },
          };
        });
      }
      return;
    }
    if (dragState && overlayRef.current) {
      const rect = overlayRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (dragState.mode === "point") {
        const price = chartHandleRef.current?.coordinateToPrice(y) ?? null;
        const time = chartHandleRef.current?.coordinateToTime(x) ?? null;
        if (price != null && time != null) {
          const snappedPrice = e.altKey ? price : getSnappedPrice(time, price);
          setDrawnLines((prev) => prev.map((item) => {
            if (item.id !== dragState.drawingId) return item;
            if (dragState.point === "p3" && isPositionDrawingTool(item.tool)) {
              return { ...item, p3: { time, price: snappedPrice } };
            }
            const next = {
              ...item,
              [dragState.point!]: { time, price: snappedPrice },
            } as ChartDrawing;
            if (item.tool === "Horizontal") {
              next.p2 = { ...next.p2, price: next.p1.price };
            }
            if (item.tool === "HorizontalRay") {
              next.p2 = { ...next.p2, price: next.p1.price };
            }
            if (item.tool === "Text") {
              next.p2 = { ...next.p1 };
            }
            if (isPositionDrawingTool(item.tool) && dragState.point !== "p3") {
              const built = buildPositionDrawingPoints(item.tool, next.p1, next.p2);
              next.p2 = built.p2;
              next.p3 = built.p3;
            }
            return next;
          }));
        }
      } else {
        const dx = x - dragState.startX;
        const dy = y - dragState.startY;
        const original = dragState.original;
        const originalP1x = chartHandleRef.current?.timeToCoordinate(original.p1.time) ?? null;
        const originalP1y = chartHandleRef.current?.priceToCoordinate(original.p1.price) ?? null;
        const originalP2x = chartHandleRef.current?.timeToCoordinate(original.p2.time) ?? null;
        const originalP2y = chartHandleRef.current?.priceToCoordinate(original.p2.price) ?? null;
        if (originalP1x != null && originalP1y != null && originalP2x != null && originalP2y != null) {
          const nextP1x = originalP1x + dx;
          const nextP1y = originalP1y + dy;
          const nextP2x = originalP2x + dx;
          const nextP2y = originalP2y + dy;
          const nextP1Time = chartHandleRef.current?.coordinateToTime(nextP1x) ?? null;
          const nextP1Price = chartHandleRef.current?.coordinateToPrice(nextP1y) ?? null;
          const nextP2Time = chartHandleRef.current?.coordinateToTime(nextP2x) ?? null;
          const nextP2Price = chartHandleRef.current?.coordinateToPrice(nextP2y) ?? null;
          if (nextP1Time != null && nextP1Price != null && nextP2Time != null && nextP2Price != null) {
            const snappedP1 = e.altKey ? nextP1Price : getSnappedPrice(nextP1Time, nextP1Price);
            const snappedP2 = e.altKey ? nextP2Price : getSnappedPrice(nextP2Time, nextP2Price);
            setDrawnLines((prev) => prev.map((item) => {
              if (item.id !== dragState.drawingId) return item;
              const next: ChartDrawing = {
                ...item,
                p1: { time: nextP1Time, price: snappedP1 },
                p2: { time: nextP2Time, price: snappedP2 },
              };
              if (original.p3 && isPositionDrawingTool(item.tool)) {
                const originalP3x = chartHandleRef.current?.timeToCoordinate(original.p3.time) ?? null;
                const originalP3y = chartHandleRef.current?.priceToCoordinate(original.p3.price) ?? null;
                if (originalP3x != null && originalP3y != null) {
                  const nextP3Time = chartHandleRef.current?.coordinateToTime(originalP3x + dx) ?? null;
                  const nextP3Price = chartHandleRef.current?.coordinateToPrice(originalP3y + dy) ?? null;
                  if (nextP3Time != null && nextP3Price != null) {
                    next.p3 = { time: nextP3Time, price: e.altKey ? nextP3Price : getSnappedPrice(nextP3Time, nextP3Price) };
                  }
                }
              }
              if (item.tool === "Horizontal") {
                next.p2 = { ...next.p2, price: next.p1.price };
              }
              if (item.tool === "HorizontalRay") {
                next.p2 = { ...next.p2, price: next.p1.price };
              }
              if (item.tool === "Text") {
                next.p2 = { ...next.p1 };
              }
              return next;
            }));
          }
        }
      }
      return;
    }
    if (!activeDrawingTool || !drawingStartRef.current || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const constrained = constrainDrawingPoint(
      activeDrawingTool,
      drawingStartRef.current,
      { x: e.clientX - rect.left, y: e.clientY - rect.top },
      e.shiftKey,
    );
    setDrawingPreview({ x1: drawingStartRef.current.x, y1: drawingStartRef.current.y, x2: constrained.x, y2: constrained.y });
  }

  async function handleOverlayMouseUp(e: React.MouseEvent) {
    if (planDragState) {
      setPlanDragState(null);
      return;
    }
    if (positionDragState) {
      const positionId = positionDragState.positionId;
      const draft = closeDraft[positionId];
      setPositionDragState(null);
      if (!draft) return;
      const nextStop = draft.stop.trim() ? parseFloat(draft.stop) : null;
      const nextTarget = draft.target.trim() ? parseFloat(draft.target) : null;
      if ((draft.stop.trim() && (nextStop == null || Number.isNaN(nextStop) || nextStop <= 0))
        || (draft.target.trim() && (nextTarget == null || Number.isNaN(nextTarget) || nextTarget <= 0))) {
        setOrderToast({ message: "Dragged level is invalid. Adjust and try again.", journalId: positionId, broker: "simulated" });
        setTimeout(() => setOrderToast(null), 3000);
        return;
      }
      setManageBusyId(positionId);
      try {
        await updateJournalEntry(positionId, {
          stop_loss: nextStop,
          target_price: nextTarget,
        });
        setOrderToast({ message: "Position levels updated from chart drag.", journalId: positionId, broker: "simulated" });
        await loadSymbolPositions();
      } catch (error: unknown) {
        setOrderToast({ message: error instanceof Error ? error.message : "Failed to update levels", journalId: positionId, broker: "simulated" });
      } finally {
        setManageBusyId(null);
        setTimeout(() => setOrderToast(null), 4000);
      }
      return;
    }
    if (dragState) {
      const edited = drawnLines.find((item) => item.id === dragState.drawingId);
      setDragState(null);
      if (edited) {
        await persistEditedDrawing(edited);
      }
      return;
    }
    if (!activeDrawingTool || !drawingStartRef.current || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const start = drawingStartRef.current;
    const constrained = constrainDrawingPoint(
      activeDrawingTool,
      start,
      { x: e.clientX - rect.left, y: e.clientY - rect.top },
      e.shiftKey,
    );
    const x2 = constrained.x;
    const y2 = constrained.y;
    drawingStartRef.current = null;
    setDrawingPreview(null);

    // Convert pixel → price/time using chart API
    const rawPrice1 = chartHandleRef.current?.coordinateToPrice(start.y) ?? null;
    const time1  = chartHandleRef.current?.coordinateToTime(start.x) ?? null;
    if (rawPrice1 == null || time1 == null) return;
    const price1 = e.altKey ? rawPrice1 : getSnappedPrice(time1, rawPrice1);

    if (activeDrawingTool === "Text") {
      const line: ChartDrawing = {
        id: crypto.randomUUID(),
        tool: activeDrawingTool,
        p1: { time: time1, price: price1 },
        p2: { time: time1, price: price1 },
        color: DRAWING_DEFAULT_COLOR,
        text: "Note",
      };
      const editorX = Math.min((overlayRef.current?.clientWidth ?? 360) - 220, start.x + 12);
      const editorY = Math.max(12, start.y - 12);
      setTextEditor({ drawingId: line.id, value: "Note", x: editorX, y: editorY, isNew: true });
      updateDrawingsWithHistory((prev) => [...prev, line]);
      setSelectedDrawingId(line.id);
      setActiveDrawingTool(null);
      trackEvent("drawing_created", { symbol, timeframe, tool: activeDrawingTool });
      try {
        const saved = await saveDrawing(symbol, {
          tool_type: getDrawingToolType(activeDrawingTool),
          points: getPersistedDrawingPoints(line),
          style: { color: line.color, text: line.text ?? null },
          timeframe,
        });
        setDrawings(prev => [...prev, saved]);
        setDrawnLines(prev => prev.map(item => item.id === line.id ? { ...item, id: saved.id } : item));
        setSelectedDrawingId(saved.id);
        setTextEditor(prev => prev?.drawingId === line.id ? { ...prev, drawingId: saved.id } : prev);
      } catch (error) {
        showDrawingPersistenceError(error, "Chart drawing could not be saved.");
      }
      return;
    }

    const rawPrice2 = chartHandleRef.current?.coordinateToPrice(y2) ?? null;
    const time2  = chartHandleRef.current?.coordinateToTime(x2) ?? null;

    if (rawPrice2 == null || time2 == null) return;
    const price2 = e.altKey ? rawPrice2 : getSnappedPrice(time2, rawPrice2);

    const finalPrice2 = activeDrawingTool === "Horizontal" || activeDrawingTool === "HorizontalRay" ? price1 : price2;
    const line: ChartDrawing = {
      id: crypto.randomUUID(),
      tool: activeDrawingTool,
      p1: { time: time1, price: price1 },
      p2: { time: time2, price: finalPrice2 },
      color: activeDrawingTool === "LongPosition" ? "#22c55e" : activeDrawingTool === "ShortPosition" ? "#ef4444" : DRAWING_DEFAULT_COLOR,
    };
    if (isPositionDrawingTool(activeDrawingTool)) {
      const built = buildPositionDrawingPoints(activeDrawingTool, line.p1, { time: time2, price: price2 });
      line.p2 = built.p2;
      line.p3 = built.p3;
    }
    updateDrawingsWithHistory((prev) => [...prev, line]);
    setSelectedDrawingId(line.id);
    setActiveDrawingTool(null);
    trackEvent("drawing_created", { symbol, timeframe, tool: activeDrawingTool });

    // Persist to DB (non-blocking)
    try {
      const saved = await saveDrawing(symbol, {
        tool_type: getDrawingToolType(activeDrawingTool),
        points: getPersistedDrawingPoints(line),
        style: { color: line.color, text: line.text ?? null },
        timeframe,
      });
      setDrawings(prev => [...prev, saved]);
      setDrawnLines(prev => prev.map(item => item.id === line.id ? { ...item, id: saved.id } : item));
      setSelectedDrawingId(saved.id);
    } catch (error) {
      showDrawingPersistenceError(error, "Chart drawing could not be saved.");
    }
  }

  const handleDeleteSingleDrawing = useCallback(async (drawingId: string) => {
    const existing = drawnLines.find(item => item.id === drawingId);
    if (!existing || existing.locked) return;
    updateDrawingsWithHistory((prev) => prev.filter(item => item.id !== drawingId));
    setSelectedDrawingId(prev => prev === drawingId ? null : prev);
    setDrawings(prev => prev.filter(item => item.id !== drawingId));
    try {
      await deleteDrawing(symbol, drawingId);
    } catch (error) {
      showDrawingPersistenceError(error, "Chart drawing could not be deleted.");
    }
  }, [drawnLines, showDrawingPersistenceError, symbol, updateDrawingsWithHistory]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.target as HTMLElement | null)?.tagName === "INPUT" || (e.target as HTMLElement | null)?.tagName === "TEXTAREA") {
        return;
      }
      const metaOrCtrl = e.metaKey || e.ctrlKey;
      if (metaOrCtrl && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          setRedoStack((future) => {
            if (!future.length) return future;
            const next = cloneDrawings(future[future.length - 1]);
            setUndoStack((history) => [...history.slice(-39), cloneDrawings(drawnLines)]);
            setDrawnLines(next);
            setSelectedDrawingId((prev) => next.some((item) => item.id === prev) ? prev : null);
            return future.slice(0, -1);
          });
        } else {
          setUndoStack((history) => {
            if (!history.length) return history;
            const next = cloneDrawings(history[history.length - 1]);
            setRedoStack((future) => [...future.slice(-39), cloneDrawings(drawnLines)]);
            setDrawnLines(next);
            setSelectedDrawingId((prev) => next.some((item) => item.id === prev) ? prev : null);
            return history.slice(0, -1);
          });
        }
        return;
      }
      if (metaOrCtrl && e.key.toLowerCase() === "y") {
        e.preventDefault();
        setRedoStack((future) => {
          if (!future.length) return future;
          const next = cloneDrawings(future[future.length - 1]);
          setUndoStack((history) => [...history.slice(-39), cloneDrawings(drawnLines)]);
          setDrawnLines(next);
          setSelectedDrawingId((prev) => next.some((item) => item.id === prev) ? prev : null);
          return future.slice(0, -1);
        });
        return;
      }
      if (e.key === "Escape") {
        setActiveDrawingTool(null);
        setSelectedDrawingId(null);
        setDrawingPreview(null);
        drawingStartRef.current = null;
        return;
      }
      const shortcut = e.key.toUpperCase();
      const match = Object.entries(DRAW_TOOL_META).find(([, meta]) => meta.short === shortcut);
      if (match) {
        e.preventDefault();
        setActiveDrawingTool(match[0] as DrawingTool);
        setSelectedDrawingId(null);
      }
      if ((e.key === "Backspace" || e.key === "Delete") && selectedDrawingId) {
        e.preventDefault();
        void handleDeleteSingleDrawing(selectedDrawingId);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawnLines, handleDeleteSingleDrawing, selectedDrawingId]);

  const clearDrawings = useCallback(async () => {
    const currentIds = drawnLines.filter(item => !item.locked).map(item => item.id);
    if (!currentIds.length) return;
    updateDrawingsWithHistory((prev) => prev.filter(item => item.locked));
    setDrawings(prev => prev.filter(item => !currentIds.includes(item.id)));
    setSelectedDrawingId(null);
    const results = await Promise.allSettled(currentIds.map(id => deleteDrawing(symbol, id)));
    const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failure) {
      showDrawingPersistenceError(failure.reason, "Some chart drawings could not be deleted.");
    }
  }, [drawnLines, showDrawingPersistenceError, symbol, updateDrawingsWithHistory]);

  const toggleDrawingLock = useCallback((drawingId: string) => {
    const drawing = drawnLines.find((item) => item.id === drawingId);
    if (!drawing) return;
    const next = { ...drawing, locked: !drawing.locked };
    updateDrawingsWithHistory((prev) => prev.map((item) => item.id === drawingId ? next : item));
    void persistEditedDrawing(next);
  }, [drawnLines, persistEditedDrawing, updateDrawingsWithHistory]);

  const toggleDrawingHidden = useCallback((drawingId: string) => {
    const drawing = drawnLines.find((item) => item.id === drawingId);
    if (!drawing) return;
    const next = { ...drawing, hidden: !drawing.hidden };
    updateDrawingsWithHistory((prev) => prev.map((item) => item.id === drawingId ? next : item));
    void persistEditedDrawing(next);
  }, [drawnLines, persistEditedDrawing, updateDrawingsWithHistory]);

  const handleUndoDrawing = useCallback(() => {
    setUndoStack((history) => {
      if (!history.length) return history;
      const next = cloneDrawings(history[history.length - 1]);
      setRedoStack((future) => [...future.slice(-39), cloneDrawings(drawnLines)]);
      setDrawnLines(next);
      setSelectedDrawingId((prev) => next.some((item) => item.id === prev) ? prev : null);
      return history.slice(0, -1);
    });
  }, [drawnLines]);

  const handleRedoDrawing = useCallback(() => {
    setRedoStack((future) => {
      if (!future.length) return future;
      const next = cloneDrawings(future[future.length - 1]);
      setUndoStack((history) => [...history.slice(-39), cloneDrawings(drawnLines)]);
      setDrawnLines(next);
      setSelectedDrawingId((prev) => next.some((item) => item.id === prev) ? prev : null);
      return future.slice(0, -1);
    });
  }, [drawnLines]);

  const beginWholeDrawingDrag = useCallback((e: React.MouseEvent, drawing: ChartDrawing) => {
    if (activeDrawingTool) return;
    if (drawing.locked || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    updateDrawingsWithHistory((prev) => cloneDrawings(prev));
    setSelectedDrawingId(drawing.id);
    setDragState({
      drawingId: drawing.id,
      mode: "whole",
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      original: cloneDrawings([drawing])[0],
    });
  }, [activeDrawingTool, updateDrawingsWithHistory]);

  const beginPointDrag = useCallback((e: React.MouseEvent, drawing: ChartDrawing, point: "p1" | "p2" | "p3") => {
    if (activeDrawingTool) return;
    if (drawing.locked || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    updateDrawingsWithHistory((prev) => cloneDrawings(prev));
    setSelectedDrawingId(drawing.id);
    setDragState({
      drawingId: drawing.id,
      mode: "point",
      point,
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      original: cloneDrawings([drawing])[0],
    });
  }, [activeDrawingTool, updateDrawingsWithHistory]);

  const editTextDrawing = useCallback((drawing: ChartDrawing) => {
    if (drawing.tool !== "Text") return;
    const x = chartHandleRef.current?.timeToCoordinate(drawing.p1.time) ?? 80;
    const y = chartHandleRef.current?.priceToCoordinate(drawing.p1.price) ?? 80;
    const editorX = Math.min((overlayRef.current?.clientWidth ?? 360) - 220, x + 12);
    const editorY = Math.max(12, y - 12);
    setTextEditor({ drawingId: drawing.id, value: drawing.text ?? "Note", x: editorX, y: editorY, isNew: false });
  }, []);

  const createZoneNoteFromDrawing = useCallback(async (drawing: ChartDrawing) => {
    if (drawing.tool !== "Rectangle") return;
    const high = Math.max(drawing.p1.price, drawing.p2.price);
    const low = Math.min(drawing.p1.price, drawing.p2.price);
    const note: ChartDrawing = {
      id: crypto.randomUUID(),
      tool: "Text",
      p1: { time: drawing.p1.time, price: high },
      p2: { time: drawing.p1.time, price: high },
      color: DRAWING_DEFAULT_COLOR,
      text: `Zone ${low.toFixed(2)}-${high.toFixed(2)}`,
    };
    updateDrawingsWithHistory((prev) => [...prev, note]);
    setSelectedDrawingId(note.id);
    try {
      const saved = await saveDrawing(symbol, {
        tool_type: "text",
        points: getPersistedDrawingPoints(note),
        style: { color: note.color, text: note.text },
        timeframe,
      });
      setDrawings(prev => [...prev, saved]);
      setDrawnLines(prev => prev.map(item => item.id === note.id ? { ...item, id: saved.id } : item));
      setSelectedDrawingId(saved.id);
    } catch (error) {
      showDrawingPersistenceError(error, "Chart drawing could not be saved.");
    }
  }, [showDrawingPersistenceError, symbol, timeframe, updateDrawingsWithHistory]);

  const commitTextEditor = useCallback(async () => {
    if (!textEditor?.drawingId) return;
    const nextText = textEditor.value.trim();
    const drawing = drawnLines.find((item) => item.id === textEditor.drawingId);
    if (!drawing) {
      setTextEditor(null);
      return;
    }
    if (!nextText) {
      if (textEditor.isNew) {
        await handleDeleteSingleDrawing(drawing.id);
      }
      setTextEditor(null);
      return;
    }
    updateDrawingsWithHistory((prev) => prev.map((item) => item.id === drawing.id ? { ...item, text: nextText } : item));
    setTextEditor(null);
    await persistEditedDrawing({ ...drawing, text: nextText });
  }, [drawnLines, handleDeleteSingleDrawing, persistEditedDrawing, textEditor, updateDrawingsWithHistory]);

  const latest = data?.latest;
  const displayClose = liveQuote?.close ?? latest?.close ?? null;
  const displayPrevClose = liveQuote?.prev_close ?? latest?.prev_close ?? null;
  const displayPctChange = liveQuote?.pct_change ?? (
    displayClose != null && displayPrevClose ? ((displayClose - displayPrevClose) / displayPrevClose) * 100 : null
  );
  const displayPositive = (displayPctChange ?? 0) >= 0;
  const sourceQueueSymbols = useMemo(() => (sourceQueue?.items ?? []).map((item) => item.symbol), [sourceQueue?.items]);
  const sourceQueueIndex = sourceQueueSymbols.findIndex((item) => item === symbol);
  const sourceQueueName = sourceQueue?.name ?? sourceWatchlist ?? null;
  const sourceQueueCount = sourceQueueSymbols.length;

  useEffect(() => {
    if (!sourceQueueSymbols.length) return;
    const request = getWatchlistChartRequest(rangeLabel);
    const params = {
      limit: request.limit,
      timeframe: request.timeframe,
      from_date: request.from_date,
      to_date: request.to_date,
    };
    const currentIndex = sourceQueueIndex >= 0 ? sourceQueueIndex : sourceQueueSymbols.findIndex((item) => item === symbol);
    const adjacent = [
      sourceQueueSymbols[currentIndex - 1],
      sourceQueueSymbols[currentIndex + 1],
    ].filter(Boolean);
    const timer = window.setTimeout(() => {
      adjacent.forEach((nextSymbol) => {
        prefetchCandles(nextSymbol, params);
        if (activeIndicators.length) prefetchIndicators(nextSymbol, activeIndicators, request.timeframe);
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [activeIndicators, rangeLabel, sourceQueueIndex, sourceQueueSymbols, symbol]);

  const buildQueueChartHref = useCallback((nextSymbol: string, full = fullChartMode) => {
    const params = new URLSearchParams();
    if (sourcePage) params.set("from", sourcePage);
    if (sourceQueue?.id ?? sourceWatchlistId) params.set("watchlistId", sourceQueue?.id ?? sourceWatchlistId ?? "");
    if (sourceQueueName) params.set("watchlist", sourceQueueName);
    if (full) params.set("full", "1");
    if (chartType !== "candles") params.set("type", chartType);
    return `/charts/${nextSymbol}${params.toString() ? `?${params.toString()}` : ""}`;
  }, [chartType, fullChartMode, sourcePage, sourceQueue?.id, sourceQueueName, sourceWatchlistId]);
  const buildWatchlistReturnHref = useCallback((includePlanDraft = false) => {
    const params = new URLSearchParams({ symbol });
    const queueId = sourceQueue?.id ?? sourceWatchlistId;
    if (queueId) params.set("id", queueId);
    if (includePlanDraft) params.set("planDraft", "chart");
    return `/watchlist?${params.toString()}`;
  }, [sourceQueue?.id, sourceWatchlistId, symbol]);
  const stepQueueSymbol = useCallback((direction: "prev" | "next") => {
    if (!sourceQueueSymbols.length) return;
    const currentIndex = sourceQueueIndex >= 0 ? sourceQueueIndex : 0;
    const nextIndex = direction === "next"
      ? (currentIndex + 1) % sourceQueueSymbols.length
      : (currentIndex - 1 + sourceQueueSymbols.length) % sourceQueueSymbols.length;
    const nextSymbol = sourceQueueSymbols[nextIndex];
    if (nextSymbol && nextSymbol !== symbol) {
      router.push(buildQueueChartHref(nextSymbol, fullChartMode));
    }
  }, [buildQueueChartHref, fullChartMode, router, sourceQueueIndex, sourceQueueSymbols, symbol]);

  useEffect(() => {
    if (!fullChartMode || sourceQueueSymbols.length <= 1) return;
    function handleQueueKeys(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName ?? "";
      const isTyping = tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" || Boolean(target?.closest("[contenteditable='true']"));
      if (isTyping) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        stepQueueSymbol("next");
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        stepQueueSymbol("prev");
      }
    }
    window.addEventListener("keydown", handleQueueKeys);
    return () => window.removeEventListener("keydown", handleQueueKeys);
  }, [fullChartMode, sourceQueueSymbols.length, stepQueueSymbol]);

  useEffect(() => {
    if (!displayClose) return;
    setTradePlan((current) => ({
      entry: current.entry || displayClose.toFixed(2),
      stop: current.stop,
      target: current.target,
    }));
  }, [displayClose]);

  // Stale data warning: show if last candle is > 1 trading day old
  const lastCandleDate = data?.candles?.at(-1)?.time ?? null;
  const dataAgeDays = lastCandleDate
    ? Math.floor((Date.now() - new Date(lastCandleDate).getTime()) / 86400000)
    : null;
  // Don't show stale warning in live mode or on weekends that are expected
  const showStaleWarning = !liveMode && dataAgeDays != null && dataAgeDays > 2;
  const changeAmt = displayClose != null && displayPrevClose ? displayClose - displayPrevClose : null;
  const changePct = displayPctChange;
  const positive = displayPositive;

  const w52pct = latest?.week_52_high && latest?.week_52_low
    ? (((displayClose ?? latest.close) - latest.week_52_low) / (latest.week_52_high - latest.week_52_low)) * 100
    : null;

  const pctFrom52H = latest?.week_52_high
    ? ((latest.week_52_high - (displayClose ?? latest.close)) / latest.week_52_high) * 100
    : null;

  // Build crosshair legend text
  const displayBar = legendBar || (data?.candles.at(-1) ? {
    ...data.candles.at(-1)!,
  } : null);
  const activeManagedPosition = symbolPositions.find((position) => position.id === activeManagedPositionId) ?? null;
  const activeManagedDraft = activeManagedPosition ? (closeDraft[activeManagedPosition.id] ?? {
    price: String(activeManagedPosition.current_price || latest?.close || activeManagedPosition.entry_price),
    reason: "",
    stop: activeManagedPosition.stop_loss != null ? String(activeManagedPosition.stop_loss) : "",
    target: activeManagedPosition.target_price != null ? String(activeManagedPosition.target_price) : "",
  }) : null;
  const planEntryValue = tradePlan.entry ? parseFloat(tradePlan.entry) : null;
  const planStopValue = tradePlan.stop ? parseFloat(tradePlan.stop) : null;
  const planTargetValue = tradePlan.target ? parseFloat(tradePlan.target) : null;
  const planRiskReward = (
    planEntryValue != null
    && planStopValue != null
    && planTargetValue != null
    && !Number.isNaN(planEntryValue)
    && !Number.isNaN(planStopValue)
    && !Number.isNaN(planTargetValue)
    && Math.abs(planEntryValue - planStopValue) > 0
  )
    ? Math.abs(planTargetValue - planEntryValue) / Math.abs(planEntryValue - planStopValue)
    : null;

  const showRsi   = activeIndicators.includes("rsi");
  const showMacd  = activeIndicators.includes("macd");
  const showStoch = activeIndicators.includes("stoch");
  const showAtr   = activeIndicators.includes("atr");
  const selectedDrawing = drawnLines.find(item => item.id === selectedDrawingId) ?? null;
  const activeToolMeta = activeDrawingTool ? DRAW_TOOL_META[activeDrawingTool] : null;
  const visibleDrawings = drawnLines.filter((item) => !item.hidden);
  const selectedPositionDrawing = selectedDrawing && isPositionDrawingTool(selectedDrawing.tool) && selectedDrawing.p3 ? selectedDrawing : null;
  const selectedPositionDraft = selectedPositionDrawing?.p3 ? {
    side: selectedPositionDrawing.tool === "ShortPosition" ? "short" : "long",
    entry: Number(selectedPositionDrawing.p1.price.toFixed(2)),
    stop: Number(selectedPositionDrawing.p2.price.toFixed(2)),
    target: Number(selectedPositionDrawing.p3.price.toFixed(2)),
    riskReward: Math.abs(selectedPositionDrawing.p3.price - selectedPositionDrawing.p1.price) / Math.max(Math.abs(selectedPositionDrawing.p1.price - selectedPositionDrawing.p2.price), 0.01),
  } : null;
  const activeIndicatorLabels = INDICATOR_CONFIG
    .filter((indicator) => activeIndicators.includes(indicator.id))
    .map((indicator) => indicator.label);
  const activeIndicatorSummary = activeIndicatorLabels.length === 0
    ? "Indicators"
    : activeIndicatorLabels.length <= 2
      ? activeIndicatorLabels.join(" · ")
      : `Indicators · ${activeIndicatorLabels.length}`;

  function previewSelectedPositionToDesk() {
    if (!selectedPositionDrawing?.p3) return;
    setPlanHandoffConfirmOpen(true);
    const side = selectedPositionDrawing.tool === "ShortPosition" ? "short" : "long";
    trackEvent("chart_plan_handoff_previewed", { symbol, timeframe, side });
  }

  function sendSelectedPositionToDesk() {
    if (!selectedPositionDrawing?.p3) return;
    const side = selectedPositionDrawing.tool === "ShortPosition" ? "short" : "long";
    const draft = buildChartPlanDraft({
      symbol,
      side,
      entry: selectedPositionDrawing.p1.price,
      stop: selectedPositionDrawing.p2.price,
      target: selectedPositionDrawing.p3.price,
      timeframe,
      drawingId: selectedPositionDrawing.id,
      setupLabel,
      playbookScore,
      readyChecks: playbookItems.filter((item) => item.status === "ready").map((item) => `${item.label}: ${item.detail}`),
    });
    if (!draft) {
      setPlanHandoffConfirmOpen(false);
      setPlanUpgradeToast("Draw a valid entry, stop, and target before sending the plan");
      return;
    }
    try {
      window.localStorage.setItem(`alphavyuh-chart-plan-draft:${symbol}`, JSON.stringify(draft));
      trackEvent("chart_plan_draft_created", { symbol, timeframe, side, confirmed: true, playbook_score: draft.playbookScore, risk_reward: draft.riskReward });
      router.push(buildWatchlistReturnHref(true));
    } catch {
      router.push(buildWatchlistReturnHref(false));
    }
  }
  const latestVolumeRatio = latest?.volume_ratio ?? null;
  const recentCandles = data?.candles?.slice(-40) ?? [];
  const recentHigh = recentCandles.length ? Math.max(...recentCandles.map((c) => c.high)) : null;
  const recentLow = recentCandles.length ? Math.min(...recentCandles.map((c) => c.low)) : null;
  const ema20Latest = indicatorData.ema20?.at(-1)?.value ?? data?.candles?.at(-1)?.ema_20 ?? null;
  const ema50Latest = indicatorData.ema50?.at(-1)?.value ?? data?.candles?.at(-1)?.ema_50 ?? null;
  const rsiLatest = rsiData.at(-1)?.value ?? null;
  const macdLatest = macdData.at(-1) ?? null;
  const structureReady = latest?.close != null && ema20Latest != null && ema50Latest != null && latest.close >= ema20Latest && ema20Latest >= ema50Latest;
  const nearSupport = latest?.close != null && recentLow != null && recentLow > 0
    ? ((latest.close - recentLow) / recentLow) * 100
    : null;
  const nearResistance = latest?.close != null && recentHigh != null && recentHigh > 0
    ? ((recentHigh - latest.close) / recentHigh) * 100
    : null;
  const stopReady = planEntryValue != null && planStopValue != null && !Number.isNaN(planEntryValue) && !Number.isNaN(planStopValue);
  const targetReady = planEntryValue != null && planTargetValue != null && !Number.isNaN(planEntryValue) && !Number.isNaN(planTargetValue);
  const setupLabel = (() => {
    if (structureReady && latestVolumeRatio != null && latestVolumeRatio >= 1.4 && nearResistance != null && nearResistance <= 3) return "Breakout watch";
    if (structureReady && nearSupport != null && nearSupport <= 4) return "Pullback watch";
    if (!structureReady && rsiLatest != null && rsiLatest < 40) return "Reversal watch";
    if (latestVolumeRatio != null && latestVolumeRatio >= 1.8) return "Volume expansion";
    return "Needs confirmation";
  })();
  const playbookItems: PlaybookItem[] = [
    {
      key: "trend",
      label: "Trend",
      status: structureReady ? "ready" : latest?.close != null && ema20Latest != null ? "watch" : "missing",
      detail: structureReady ? "Price above EMA stack" : ema20Latest != null ? "EMA stack not aligned" : "Add EMA 20/50",
    },
    {
      key: "level",
      label: "Level",
      status: nearSupport != null && nearSupport <= 4 || nearResistance != null && nearResistance <= 4 ? "ready" : recentHigh && recentLow ? "watch" : "missing",
      detail: recentHigh && recentLow
        ? `S ${fmtPrice(recentLow, symbolCurrency)} · R ${fmtPrice(recentHigh, symbolCurrency)}`
        : "Need more candles",
    },
    {
      key: "volume",
      label: "Volume",
      status: latestVolumeRatio != null && latestVolumeRatio >= 1.4 ? "ready" : latestVolumeRatio != null ? "watch" : "missing",
      detail: latestVolumeRatio != null ? `${latestVolumeRatio.toFixed(2)}x average` : "Volume ratio pending",
    },
    {
      key: "momentum",
      label: "Momentum",
      status: (rsiLatest != null && rsiLatest >= 55) || (macdLatest?.histogram != null && macdLatest.histogram > 0) ? "ready" : rsiLatest != null ? "watch" : "missing",
      detail: rsiLatest != null ? `RSI ${rsiLatest.toFixed(0)}${macdLatest?.histogram != null ? ` · MACD ${macdLatest.histogram >= 0 ? "+" : ""}${macdLatest.histogram.toFixed(2)}` : ""}` : "Enable RSI/MACD",
    },
    {
      key: "risk",
      label: "Risk",
      status: stopReady && targetReady && planRiskReward != null && planRiskReward >= 2 ? "ready" : stopReady || targetReady ? "watch" : "missing",
      detail: planRiskReward != null ? `R:R ${planRiskReward.toFixed(2)}` : "Set entry, stop, target",
    },
  ];
  const playbookReadyCount = playbookItems.filter((item) => item.status === "ready").length;
  const playbookScore = Math.round((playbookReadyCount / playbookItems.length) * 100);
  const chartSnapshot = [
    { label: liveQuote ? "Live price" : "Last price", value: displayClose != null ? fmtPrice(displayClose, symbolCurrency) : "Pending", tone: "var(--text-primary)" },
    { label: "Session move", value: changePct != null ? `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%` : "Pending", tone: positive ? "var(--gain)" : "var(--loss)" },
    { label: "From 52W high", value: pctFrom52H != null ? `${pctFrom52H.toFixed(1)}% below` : "Pending", tone: "var(--accent)" },
    {
      label: "Broker",
      value: brokerStatusError
        ? "Status unavailable"
        : brokerConnected
        ? `${brokerStatus?.broker ?? "Broker"} ready`
        : brokerStatus?.token_expired
          ? "Reconnect required"
          : "Not linked",
      tone: brokerConnected ? "var(--gain)" : "var(--warn)",
    },
  ];
  const chartContextPills = [
    sourcePage === "watchlist" && sourceWatchlist ? `Queue · ${sourceWatchlist}` : sourcePage === "scanner" ? "Flow · Scanner chart" : "Flow · Direct chart",
    activeToolMeta ? `Tool · ${activeToolMeta.label}` : "Tool · Cursor",
    drawingsError ? "Drawings unavailable" : selectedDrawing ? `Selected · ${selectedDrawing.tool}` : `${visibleDrawings.length} drawings`,
    indicatorError ? "Indicators unavailable" : null,
    compareError ? "Compare unavailable" : null,
    symbolReviewError ? "Review unavailable" : null,
    sourceQueueError ? "Watchlists unavailable" : null,
    priceAlertsError ? "Alerts unavailable" : priceAlerts.length > 0 ? `Alerts · ${priceAlerts.length}` : null,
    symbolPositionsError ? "Positions unavailable" : symbolPositions.length > 0 ? `Positions · ${symbolPositions.length}` : "No position",
  ].filter(Boolean) as string[];

  async function reportChartDataIssue() {
    setOrderToast({ message: "Reporting data issue...", journalId: null, broker: "simulated" });
    try {
      await createFeedbackReport({
        category: "data_issue",
        page: `/charts/${symbol}`,
        symbol,
        severity: "high",
        message: `Chart data issue reported for ${symbol}.`,
        context: { timeframe, live_mode: liveMode, latest_time: data?.candles.at(-1)?.time },
      });
      setOrderToast({ message: "Data issue reported.", journalId: null, broker: "simulated" });
    } catch (error) {
      setOrderToast({ message: error instanceof Error ? error.message : "Could not report data issue.", journalId: null, broker: "simulated" });
    }
  }

  return (
    <div
      className="workspace-page"
      style={fullChartMode
        ? { background: "transparent", height: "100vh", minHeight: "100vh", gap: 0 }
        : { background: "transparent" }}
    >
      {!fullChartMode && (
      <div className="workspace-card" style={{ padding: "14px 18px", marginBottom: 16 }}>
        <div className="workspace-toolbar" style={{ minHeight: "auto", padding: 0, border: "none", gap: 14 }}>
          <div>
            <EyebrowLabel>Chart review</EyebrowLabel>
            <div className="workspace-card-copy">
              {symbol} chart · inspect structure, levels, volume, indicators, and review context before deciding whether to plan a trade.
            </div>
            {sourcePage === "watchlist" && sourceWatchlist && (
              <div className="caption" style={{ marginTop: 8 }}>
                Opened from <Num style={{ color: "var(--text-primary)" }}>{sourceWatchlist}</Num>.
              </div>
            )}
          </div>
          <div className="workspace-pill-row" style={{ gap: 8 }}>
            {chartSnapshot.map((item) => (
              <span key={item.label} className="workspace-pill" style={{ color: item.tone }}>
                {item.label}: <Num>{item.value}</Num>
              </span>
            ))}
          </div>
        </div>
        <div className="workspace-pill-row" style={{ marginTop: 12, gap: 8 }}>
          <Link href="/scanner" prefetch={false} className="workspace-chip-button">Scanner</Link>
          <Link href="/watchlist" prefetch={false} className="workspace-chip-button">Watchlist</Link>
          <Link href="/journal" prefetch={false} className="workspace-chip-button">Journal</Link>
          <Link href={buildWatchlistReturnHref(true)} prefetch={false} className="workspace-chip-button active">Plan trade</Link>
          <button onClick={reportChartDataIssue} className="workspace-chip-button">Report data</button>
          {!brokerConnected && (
            <Link href="/settings/broker" prefetch={false} className="workspace-chip-button">
              {brokerStatusError ? "Check broker status" : brokerStatus?.token_expired ? "Reconnect broker" : "Connect broker"}
            </Link>
          )}
          {chartContextPills.map((item) => (
            <span key={item} className="workspace-pill">{item}</span>
          ))}
          {liveQuoteUpdatedAt && (
            <span className="workspace-pill">Quote · {liveQuote?.source ?? "live"} · {liveQuoteUpdatedAt}</span>
          )}
        </div>
      </div>
      )}

      <div
        className="workspace-card"
        style={fullChartMode
          ? { flex: 1, display: "flex", flexDirection: "column", height: "100vh", borderRadius: 0, borderLeft: 0, borderRight: 0, borderTop: 0, borderBottom: 0 }
          : { flex: 1, display: "flex", flexDirection: "column" }}
      >

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
            {priceAlertsError && (
              <div className="mb-4 rounded-[7px] px-3 py-2 text-[12px] leading-relaxed"
                style={{ background: "rgba(217,119,6,0.08)", color: "var(--warn)", border: "1px solid rgba(217,119,6,0.22)" }}>
                {priceAlertsError}
              </div>
            )}
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
                placeholder={`Target price${displayClose ? ` (current ₹${displayClose.toFixed(2)})` : ""}`}
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
          Data is {dataAgeDays} days old. Scanner and chart context are using the latest available market snapshot.
        </div>
      )}

      {sourceQueueError && sourcePage === "watchlist" && (
        <div
          data-testid="chart-source-watchlists-outage"
          className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-[11px] flex-shrink-0"
          style={{ background: "rgba(217,119,6,0.08)", borderBottom: "1px solid rgba(217,119,6,0.2)", color: "var(--warn)" }}
        >
          <span>
            <strong>Watchlist queue unavailable.</strong> {sourceQueueError} Chart review, drawing, alerts, and order planning remain usable.
          </span>
          <button
            type="button"
            onClick={() => loadSourceQueue(true)}
            className="rounded-full px-3 py-1 text-[11px] font-semibold transition-colors"
            style={{ border: "1px solid rgba(217,119,6,0.35)", color: "var(--warn)", background: "rgba(217,119,6,0.08)" }}
          >
            Retry
          </button>
        </div>
      )}

      {compareError && compareSymbol && (
        <div
          data-testid="chart-compare-unavailable"
          className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-[11px] flex-shrink-0"
          style={{ background: "rgba(217,119,6,0.08)", borderBottom: "1px solid rgba(217,119,6,0.2)", color: "var(--warn)" }}
        >
          <span>
            <strong>Compare unavailable for {compareSymbol}.</strong> {compareError} The base chart, drawings, alerts, and order planning remain usable.
          </span>
          <button
            type="button"
            onClick={() => setCompareRetryNonce((current) => current + 1)}
            className="rounded-full px-3 py-1 text-[11px] font-semibold transition-colors"
            style={{ border: "1px solid rgba(217,119,6,0.35)", color: "var(--warn)", background: "rgba(217,119,6,0.08)" }}
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <div className="workspace-toolbar chart-command-bar" style={{ flexShrink: 0 }}>
        {/* Left: symbol search + name */}
        <div className="workspace-toolbar-group">
          <SymbolSearch
            value={symbol}
            onChange={sym => router.push(buildQueueChartHref(sym, fullChartMode))}
          />
          {data && (
            <span className="text-[12px] text-[#aaa] hidden sm:block truncate max-w-[200px]">
              {data.company_name}
            </span>
          )}
          {sourceQueueCount > 0 && (
            <div className="hidden md:flex items-center gap-1.5 rounded-full px-2 py-1"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <button
                onClick={() => stepQueueSymbol("prev")}
                className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{ color: "var(--app-text2)", background: "rgba(255,255,255,0.04)" }}
              >
                ↑
              </button>
              <Num className="text-[11px] font-semibold" style={{ color: "var(--app-text2)" }}>
                {sourceQueueName ?? "Watchlist"} {sourceQueueIndex >= 0 ? sourceQueueIndex + 1 : "-"} / {sourceQueueCount}
              </Num>
              <button
                onClick={() => stepQueueSymbol("next")}
                className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{ color: "var(--app-text2)", background: "rgba(255,255,255,0.04)" }}
              >
                ↓
              </button>
            </div>
          )}
        </div>

        {/* Right: timeframe + indicators + drawing tools + save */}
        <div className="workspace-toolbar-group">
          <ChartTimeframeDropdown
            value={rangeLabel}
            onChange={(next) => {
              const request = getWatchlistChartRequest(next);
              setRangeLabel(next);
              setTimeframe(request.timeframe);
              setRangeNote(null);
              setTimeframeMessage("");
            }}
            onUnavailable={setTimeframeMessage}
          />

          <label className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: "var(--app-text3)" }}>
            Chart
            <select
              value={chartType}
              onChange={(event) => setChartType(event.target.value as ChartDisplayType)}
              className="text-[11px] rounded-[999px] px-3 py-1.5 font-semibold outline-none"
              style={{
                background: "var(--app-surface3)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "var(--app-text1)",
              }}
            >
              <option value="candles">Candles</option>
              <option value="bars">Bars</option>
              <option value="line">Line</option>
            </select>
          </label>

          <div ref={indicatorMenuRef} className="relative">
            <button
              onClick={() => setShowIndicatorMenu((current) => !current)}
              className={`workspace-chip-button ${activeIndicators.length > 0 ? "active" : ""} flex items-center gap-1`}
              style={activeIndicators.length > 0
                ? { background: "rgba(139,150,166,0.15)", color: "#bac4d1", border: "1px solid rgba(139,150,166,0.3)" }
                : { background: "var(--app-surface3)", color: "var(--app-text3)", border: "1px solid var(--app-border)" }}
            >
              <SlidersHorizontal size={12} />
              {activeIndicatorSummary} ▾
            </button>
            {showIndicatorMenu && (
              <div className="absolute top-full left-0 mt-1 z-50 rounded-[8px] py-1 shadow-xl"
                style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", minWidth: 220 }}>
                {INDICATOR_CONFIG.map(ind => {
                  const active = activeIndicators.includes(ind.id);
                  const locked = !FREE_INDICATORS.includes(ind.id) && userPlan === "free";
                  return (
                    <button
                      key={ind.id}
                      onClick={() => { toggleIndicator(ind.id); }}
                      className="w-full text-left flex items-center gap-2 px-3 py-2 text-[12px] transition-colors"
                      style={{ color: active ? ind.color : "var(--app-text2)" }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--app-surface3)"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                    >
                      <span className="w-3 h-3 rounded-[3px] flex-shrink-0 flex items-center justify-center text-[9px]" style={{ background: active ? ind.color + "22" : "transparent", border: `1px solid ${active ? ind.color : "var(--app-border)"}` }}>
                        {active ? <Check size={9} strokeWidth={3} /> : ""}
                      </span>
                      {locked && <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ flexShrink: 0 }}><rect x="1.5" y="3.5" width="5" height="4" rx="0.5" fill="currentColor"/><path d="M2.5 3.5V2.5a1.5 1.5 0 013 0v1" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>}
                      {ind.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tools dropdown */}
          <div ref={drawMenuRef} className="relative">
            <button
              onClick={() => setShowDrawMenu(s => !s)}
              className={`workspace-chip-button ${activeDrawingTool ? 'active' : ''} flex items-center gap-1`}
              style={activeDrawingTool
                ? { background: "rgba(139,150,166,0.2)", color: "#bac4d1", border: "1px solid rgba(139,150,166,0.4)" }
                : { background: "var(--app-surface3)", color: "var(--app-text3)", border: "1px solid var(--app-border)" }
              }
            >
              {activeToolMeta ? `Tools · ${activeToolMeta.label}` : "Tools"} ▾
            </button>
            {showDrawMenu && (
              <div className="absolute top-full left-0 mt-1 z-50 rounded-[8px] py-1 shadow-xl"
                style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", minWidth: 190 }}>
                <button
                  onClick={() => { setActiveDrawingTool(null); setShowDrawMenu(false); }}
                  className="w-full text-left px-3 py-2 text-[12px] transition-colors flex items-center gap-2"
                  style={{ color: !activeDrawingTool ? "#bac4d1" : "var(--app-text2)" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--app-surface3)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                >
                  <MousePointer2 size={14} />
                  <span className="flex-1">Select / move</span>
                  <span className="text-[10px] opacity-60">Esc</span>
                </button>
                <div className="mx-2 my-1 h-px" style={{ background: "var(--app-border)" }} />
                {FULL_CHART_DRAWING_TOOLS.map(tool => {
                  const meta = DRAW_TOOL_META[tool];
                  const Icon = meta.icon;
                  return (
                    <button
                      key={tool}
                      onClick={() => { setActiveDrawingTool(t => t === tool ? null : tool); setShowDrawMenu(false); }}
                      className="w-full text-left px-3 py-2 text-[12px] transition-colors flex items-center gap-2"
                      style={{ color: activeDrawingTool === tool ? "#bac4d1" : "var(--app-text2)" }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--app-surface3)"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                    >
                      <Icon size={14} />
                      <span className="flex-1">{meta.label}</span>
                      <span className="text-[10px] opacity-60">{meta.short}</span>
                    </button>
                  );
                })}
                <div className="mx-2 my-1 h-px" style={{ background: "var(--app-border)" }} />
                <button
                  onClick={() => { setShowAlertModal(true); setShowDrawMenu(false); }}
                  className="w-full text-left px-3 py-2 text-[12px] transition-colors flex items-center gap-2"
                  style={{ color: "var(--app-text2)" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--app-surface3)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                >
                  <Bell size={14} />
                  <span className="flex-1">Price alert</span>
                </button>
                <button
                  onClick={() => setSnapToPrice((current) => !current)}
                  className="w-full text-left px-3 py-2 text-[12px] transition-colors flex items-center gap-2"
                  style={{ color: snapToPrice ? "#bac4d1" : "var(--app-text2)" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--app-surface3)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                >
                  <Magnet size={14} />
                  <span className="flex-1">Magnet / snap</span>
                  <span className="text-[10px] opacity-70">{snapToPrice ? "On" : "Off"}</span>
                </button>
                {drawnLines.length > 0 && (
                  <>
                    <div className="mx-2 my-1 h-px" style={{ background: "var(--app-border)" }} />
                    <button
                      onClick={() => { clearDrawings(); setShowDrawMenu(false); }}
                      className="w-full text-left px-3 py-1.5 text-[12px] transition-colors"
                      style={{ color: "var(--app-loss)" }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--app-surface3)"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                    >
                      Clear all
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <button
            onClick={handleUndoDrawing}
            disabled={undoStack.length === 0}
            className="workspace-chip-button flex items-center gap-1.5 disabled:opacity-40"
            title="Undo drawing change"
          >
            <RotateCcw size={11} />
          </button>

          <button
            onClick={handleRedoDrawing}
            disabled={redoStack.length === 0}
            className="workspace-chip-button flex items-center gap-1.5 disabled:opacity-40"
            title="Redo drawing change"
          >
            <RotateCw size={11} />
          </button>

          {/* Clear drawings shortcut (when active) */}
          {drawnLines.length > 0 && !showDrawMenu && (
            <button
              onClick={clearDrawings}
              className="workspace-chip-button"
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
                      setCompareError(null);
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
                style={compareError
                  ? { background: "rgba(217,119,6,0.10)", border: "1px solid rgba(217,119,6,0.24)", color: "var(--warn)" }
                  : { background: "rgba(255,255,255,0.03)", border: "1px solid var(--app-border)", color: "var(--app-teal)" }}>
                {compareError ? `Compare unavailable · ${compareSymbol}` : `vs ${compareSymbol}`}
                <button onClick={() => { setCompareSymbol(""); setCompareData(null); setCompareError(null); }} className="ml-0.5 hover:text-[#e5383b] transition-colors">×</button>
              </div>
            ) : (
              <button
                onClick={() => setShowCompareInput(true)}
                className="workspace-chip-button"
                title="Compare with another symbol"
              >
                Compare
              </button>
            )}
          </div>

          {/* Provider data badge */}
          <button
            onClick={() => setLiveMode(false)}
            disabled
            className="workspace-chip-button flex items-center gap-1.5"
            style={{ opacity: 0.85 }}
            title="Charts use the latest available market snapshot unless a provider source is shown."
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--app-text3)" }} />
            <DataProvenanceBadge kind={isMockMode ? "demo" : data?.source_metadata?.mode === "fallback" ? "fallback" : "eod"} asOf={data?.source_metadata?.as_of ?? lastCandleDate} compact />
          </button>

          {/* Price alert bell */}
          <button
            onClick={() => { setShowAlertModal(m => !m); setAlertMsg(""); }}
            className="workspace-chip-button relative flex items-center gap-1"
            style={priceAlertsError
              ? { background: "rgba(217,119,6,0.08)", color: "var(--warn)", border: "1px solid rgba(217,119,6,0.22)" }
              : priceAlerts.length > 0
              ? { background: "rgba(217,119,6,0.10)", color: "#d97706", border: "1px solid rgba(217,119,6,0.22)" }
              : undefined}
            title={priceAlertsError ?? "Price alerts"}
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

          {fullChartMode ? (
            <Link href={buildWatchlistReturnHref(false)} prefetch={false} className="workspace-chip-button">
              Exit full
            </Link>
          ) : (
            <button
              onClick={() => router.push(buildQueueChartHref(symbol, true))}
              className="workspace-chip-button"
            >
              Full chart
            </button>
          )}

          {/* Save layout */}
          <button
            onClick={handleSaveLayout}
            className="workspace-chip-button flex items-center gap-1.5"
          >
            <Save size={11} /> Save
          </button>
          <button
            onClick={handleSaveDefaultLayout}
            className="workspace-chip-button flex items-center gap-1.5"
            title="Use this timeframe and indicator set for new charts"
          >
            <Save size={11} /> Preset
          </button>
          {layoutMsg && (
            <span className="caption" style={{ color: /unavailable|could not|failed/i.test(layoutMsg) ? "var(--warn)" : "var(--gain)" }}>{layoutMsg}</span>
          )}
        </div>
      </div>

      {/* ── Body: sidebar + chart area ────────────────────────────────── */}
      <div className="chart-workspace-body flex flex-1 min-h-0 overflow-hidden">

        {/* Order modal */}
        {showOrder && displayClose != null && (
          <OrderModal
            symbol={symbol}
            currentPrice={displayClose}
            defaultSide={orderSide}
            initialPlan={{
              entry: tradePlan.entry ? parseFloat(tradePlan.entry) : displayClose,
              stop: tradePlan.stop ? parseFloat(tradePlan.stop) : null,
              target: tradePlan.target ? parseFloat(tradePlan.target) : null,
            }}
            onClose={() => setShowOrder(false)}
            onFilled={(result: OrderResult) => {
              setShowOrder(false);
              setOrderToast({
                message: result.message,
                journalId: result.journal_id,
                broker: result.broker,
                nextActions: result.next_actions,
                riskReward: result.risk_reward,
              });
              void loadSymbolPositions();
              setTimeout(() => setOrderToast(null), 9000);
            }}
          />
        )}

        {/* Order toast */}
        {orderToast && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 shadow-xl"
            style={{
              width: "min(520px, calc(100vw - 24px))",
              borderRadius: 18,
              padding: "12px 14px",
              border: "1px solid rgba(255,255,255,0.08)",
              background: "linear-gradient(180deg, rgba(20,29,33,0.98), rgba(13,20,24,0.98))",
              color: "white",
            }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{orderToast.message}</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.72)" }}>
                {orderToast.broker === "simulated" ? "Journal capture" : `Broker routed via ${orderToast.broker}`} · journal capture completed
                {orderToast.riskReward != null ? ` · R:R ${orderToast.riskReward.toFixed(2)}` : ""}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Link href="/journal" prefetch={false} style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)" }}>
                  Open journal
                </Link>
                <Link href="/journal?tab=ai" prefetch={false} style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.82)" }}>
                  Review flow
                </Link>
              </div>
            </div>
            {orderToast.nextActions?.length ? (
              <div style={{ marginTop: 10, display: "grid", gap: 5 }}>
                {orderToast.nextActions.slice(0, 3).map((action) => (
                  <div key={action} style={{ fontSize: 11, color: "rgba(255,255,255,0.68)", lineHeight: 1.45 }}>
                    {action}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {/* Sidebar */}
        <aside className="chart-side-panel w-[240px] flex-shrink-0 flex flex-col overflow-y-auto"
          style={{ background: "linear-gradient(180deg, rgba(244,247,251,0.04), rgba(255,255,255,0.02)), var(--surface-1)", borderRight: "1px solid rgba(255,255,255,0.07)" }}>
          {loading && !data ? (
            <div className="p-4 space-y-3">
              {[80, 50, 60, 40, 70].map((w, i) => (
                <div key={i} className="h-3 rounded animate-pulse" style={{ background: "var(--app-surface3)", width: `${w}%` }} />
              ))}
            </div>
          ) : error && !data ? (
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
                    {fmtPrice(displayClose, symbolCurrency)}
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
                      {watchlistsError ? (
                        <div
                          data-testid="chart-watchlists-outage"
                          className="px-3 py-3 text-[12px] leading-relaxed"
                          style={{ color: "var(--warn)", borderTop: "1px solid var(--app-border2)" }}
                        >
                          <div className="font-semibold mb-1">Watchlists unavailable</div>
                          <div>{watchlistsError}</div>
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleAddWatchlist(true)}
                              className="rounded-full px-3 py-1 text-[11px] font-semibold"
                              style={{ border: "1px solid rgba(217,119,6,0.35)", color: "var(--warn)" }}
                            >
                              Retry
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowWlPicker(false)}
                              className="rounded-full px-3 py-1 text-[11px] font-semibold"
                              style={{ border: "1px solid var(--app-border)", color: "var(--app-text3)" }}
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      ) : watchlistsLoading ? (
                        <div className="px-3 py-3 text-[12px]" style={{ color: "var(--app-text3)", borderTop: "1px solid var(--app-border2)" }}>
                          Loading watchlists...
                        </div>
                      ) : watchlists.length === 0 ? (
                        <div className="px-3 py-3 text-[12px] leading-relaxed" style={{ color: "var(--app-text3)", borderTop: "1px solid var(--app-border2)" }}>
                          No watchlists available. Create a list from the Watchlist desk.
                        </div>
                      ) : watchlists.map(wl => (
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
                    <button onClick={() => handleAddWatchlist()}
                      disabled={watchlistsLoading}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-[7px] text-[11px] transition-colors"
                      style={{ border: "1px solid var(--app-border)", color: "var(--app-text2)" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--app-teal)"; (e.currentTarget as HTMLElement).style.color = "var(--app-teal)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--app-border)"; (e.currentTarget as HTMLElement).style.color = "var(--app-text2)"; }}>
                      <BookmarkPlus size={12} /> {watchlistsLoading ? "Loading..." : "Add to watchlist"}
                    </button>
                  )}
                </div>
              </div>

              <div style={{ borderBottom: "1px solid var(--app-border)" }}>
                <div className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.5px] font-semibold" style={{ color: "var(--app-text3)" }}>Chart playbook</div>
                      <div className="text-[13px] font-semibold mt-1" style={{ color: "var(--app-text1)" }}>{setupLabel}</div>
                    </div>
                    <div className="rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums"
                      style={{ background: playbookScore >= 80 ? "rgba(38,166,91,0.14)" : playbookScore >= 50 ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.05)", color: playbookScore >= 80 ? "#4ade80" : playbookScore >= 50 ? "#fbbf24" : "var(--app-text2)" }}>
                      {playbookScore}
                    </div>
                  </div>
                  <details className="rounded-[10px]" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <summary className="px-3 py-2 text-[11px] font-semibold cursor-pointer" style={{ color: "var(--app-text1)" }}>Setup checks</summary>
                    <div className="px-3 pb-3 space-y-1.5">
                      {playbookItems.map((item) => (
                        <div key={item.key} className="flex items-center justify-between gap-2 text-[10px]">
                          <span style={{ color: "var(--app-text2)" }}>{item.label}</span>
                          <span className="truncate text-right" style={{ color: item.status === "ready" ? "#4ade80" : item.status === "watch" ? "#fbbf24" : "var(--app-text3)", maxWidth: 130 }}>
                            {item.detail}
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                  <details className="rounded-[10px]" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <summary className="px-3 py-2 text-[11px] font-semibold cursor-pointer" style={{ color: "var(--app-text1)" }}>Trade plan</summary>
                    <div className="px-3 pb-3 text-[10px] leading-4" style={{ color: "var(--app-text3)" }}>
                      Plan levels live in the Watchlist Decision Desk. Full chart keeps the visual review clear.
                    </div>
                  </details>
                  <details className="rounded-[10px]" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <summary className="px-3 py-2 text-[11px] font-semibold cursor-pointer" style={{ color: "var(--app-text1)" }}>Review context</summary>
                    <div className="px-3 pb-3 text-[10px] leading-4" style={{ color: "var(--app-text3)" }}>
                      {symbolReviewError
                        ? `Unavailable for ${symbol}. Closed trades are not being treated as empty while review context is unavailable.`
                        : symbolReview.closed > 0 ? `${symbolReview.closed} closed · ${symbolReview.reviewed} reviewed` : `No closed trades on ${symbol} yet.`}
                    </div>
                  </details>
                  <details className="rounded-[10px]" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <summary className="px-3 py-2 text-[11px] font-semibold cursor-pointer" style={{ color: "var(--app-text1)" }}>Alerts</summary>
                    <div className="grid grid-cols-2 gap-2 px-3 pb-3">
                      <button
                        onClick={() => void handleQuickAlert("above", recentHigh, `${symbol} breakout above recent resistance`)}
                        disabled={alertSaving || recentHigh == null}
                        className="rounded-[8px] px-2.5 py-2 text-[11px] font-semibold disabled:opacity-50"
                        style={{ background: "rgba(38,166,91,0.12)", color: "#4ade80", border: "1px solid rgba(38,166,91,0.22)" }}
                      >
                        Breakout
                      </button>
                      <button
                        onClick={() => void handleQuickAlert("below", recentLow, `${symbol} lost recent support`)}
                        disabled={alertSaving || recentLow == null}
                        className="rounded-[8px] px-2.5 py-2 text-[11px] font-semibold disabled:opacity-50"
                        style={{ background: "rgba(229,56,59,0.12)", color: "#f87171", border: "1px solid rgba(229,56,59,0.22)" }}
                      >
                        Support
                      </button>
                    </div>
                  </details>
                  {quickAlertMsg && (
                    <div className="text-[10px] mt-2" style={{ color: quickAlertMsg.includes("failed") || quickAlertMsg.includes("unavailable") ? "#f87171" : "#4ade80" }}>
                      {quickAlertMsg}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ borderBottom: "1px solid var(--app-border)" }}>
                <button
                  onClick={() => setShowReviewPanel((current) => !current)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors"
                  style={{ color: "var(--app-text2)" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--app-surface2)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                >
                  <span className="text-[10px] uppercase tracking-[0.5px] font-semibold" style={{ color: "var(--app-text3)" }}>Review context</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px]" style={{ color: symbolReviewError ? "#fbbf24" : symbolReview.reviewed > 0 ? "#4ade80" : symbolReview.closed > 0 ? "#fbbf24" : "var(--app-text3)" }}>
                      {symbolReviewError ? "Unavailable" : symbolReview.reviewed > 0 ? "Reviewed" : symbolReview.closed > 0 ? "Needs review" : "No history"}
                    </span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="transition-transform flex-shrink-0" style={{ transform: showReviewPanel ? "rotate(180deg)" : "rotate(0deg)" }}>
                      <path d="M2 4l4 4 4-4" stroke="var(--app-text3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </button>
                {showReviewPanel && (
                  <div className="px-4 pb-4 space-y-2">
                    {symbolReviewError && (
                      <div
                        data-testid="chart-review-context-unavailable"
                        className="rounded-[8px] px-3 py-2 text-[10px] leading-4"
                        style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.28)", color: "#fbbf24" }}
                      >
                        <strong>Review context unavailable for {symbol}.</strong> {symbolReviewError} Closed trades are not being treated as empty while review context is unavailable.
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "Closed", value: symbolReviewError ? "—" : String(symbolReview.closed) },
                        { label: "Reviewed", value: symbolReviewError ? "—" : String(symbolReview.reviewed) },
                        { label: "Win rate", value: !symbolReviewError && symbolReview.winRate != null ? `${symbolReview.winRate.toFixed(0)}%` : "—" },
                      ].map((item) => (
                        <div key={item.label} className="rounded-[8px] px-2.5 py-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--app-border)" }}>
                          <div className="text-[9px] uppercase tracking-[0.4px]" style={{ color: "var(--app-text3)" }}>{item.label}</div>
                          <div className="text-[12px] font-semibold tabular-nums" style={{ color: "var(--app-text1)", marginTop: 2 }}>{item.value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="text-[10px] leading-4" style={{ color: "var(--app-text3)" }}>
                      {symbolReviewError
                        ? `Journal review context for ${symbol} could not be loaded.`
                        : symbolReview.closed > 0
                        ? `${symbolReview.reviewed < symbolReview.closed ? `${symbolReview.closed - symbolReview.reviewed} closed trade${symbolReview.closed - symbolReview.reviewed === 1 ? "" : "s"} on ${symbol} still need lesson coverage.` : `Review coverage exists for ${symbol}.`}`
                        : `No closed trades on ${symbol} yet.`}
                      {symbolReview.lastSetup ? ` Last setup: ${symbolReview.lastSetup}.` : ""}
                    </div>
                    {symbolReview.latestLesson && (
                      <div className="rounded-[8px] px-3 py-2 text-[10px] leading-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--app-border)", color: "var(--app-text2)" }}>
                        Latest lesson: {symbolReview.latestLesson.slice(0, 140)}{symbolReview.latestLesson.length > 140 ? "…" : ""}
                      </div>
                    )}
                  </div>
                )}
              </div>
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
              <div style={{ borderBottom: "1px solid var(--app-border)" }}>
                <button
                  onClick={() => setShowPositionsPanel((current) => !current)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors"
                  style={{ color: "var(--app-text2)" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--app-surface2)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                >
                  <span className="text-[10px] uppercase tracking-[0.5px] font-semibold" style={{ color: "var(--app-text3)" }}>Open trades</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px]" style={{ color: symbolPositionsError ? "var(--warn)" : "var(--app-text3)" }}>
                      {symbolPositionsError ? "Unavailable" : symbolPositions.length}
                    </span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="transition-transform flex-shrink-0" style={{ transform: showPositionsPanel ? "rotate(180deg)" : "rotate(0deg)" }}>
                      <path d="M2 4l4 4 4-4" stroke="var(--app-text3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </button>
                {showPositionsPanel && (
                <div className="px-4 pb-4 space-y-3">
                  {positionsLoading ? (
                    <div className="space-y-2">
                      {[1, 2].map((i) => (
                        <div key={i} className="h-12 rounded-[10px] animate-pulse" style={{ background: "var(--app-surface3)" }} />
                      ))}
                    </div>
                  ) : symbolPositionsError ? (
                    <div className="rounded-[10px] px-3 py-3 text-[11px] leading-5" style={{ background: "rgba(217,119,6,0.08)", color: "var(--warn)", border: "1px solid rgba(217,119,6,0.22)" }}>
                      {symbolPositionsError} Open positions are not being treated as empty while account data is unavailable.
                    </div>
                  ) : symbolPositions.length === 0 ? (
                    <div className="rounded-[10px] px-3 py-3 text-[11px] leading-5" style={{ background: "var(--app-surface2)", color: "var(--app-text3)" }}>
                      No open positions in {symbol}. New orders placed here will auto-create journal entries and appear in this panel.
                    </div>
                  ) : (
                    symbolPositions.map((position) => {
                      const draft = closeDraft[position.id] ?? {
                        price: String(position.current_price || latest?.close || position.entry_price),
                        reason: "",
                        stop: position.stop_loss != null ? String(position.stop_loss) : "",
                        target: position.target_price != null ? String(position.target_price) : "",
                      };
                      const pnlPositive = position.unrealised_pnl >= 0;
                      const stopValue = draft.stop ? parseFloat(draft.stop) : null;
                      const targetValue = draft.target ? parseFloat(draft.target) : null;
                      const stopDistance = stopValue != null ? Math.abs(position.entry_price - stopValue) : null;
                      const targetDistance = targetValue != null ? Math.abs(targetValue - position.entry_price) : null;
                      const riskReward = stopDistance && targetDistance && stopDistance > 0
                        ? targetDistance / stopDistance
                        : null;
                      return (
                        <div key={position.id} className="rounded-[12px] p-3 space-y-3" style={{ background: "var(--app-surface2)", border: "1px solid var(--app-border)" }}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-[12px] font-semibold" style={{ color: "var(--app-text1)" }}>
                                {position.trade_type === "long" ? "Long" : "Short"} · {position.quantity} qty
                              </div>
                              <div className="text-[11px]" style={{ color: "var(--app-text3)" }}>
                                Entry {fmtPrice(position.entry_price, symbolCurrency)} · Current {fmtPrice(position.current_price, symbolCurrency)}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-[12px] font-semibold tabular-nums" style={{ color: pnlPositive ? "#26a65b" : "#e5383b" }}>
                                {pnlPositive ? "+" : ""}{fmtPrice(position.unrealised_pnl, symbolCurrency)}
                              </div>
                              <div className="text-[10px] tabular-nums" style={{ color: pnlPositive ? "#26a65b" : "#e5383b" }}>
                                {pnlPositive ? "+" : ""}{position.unrealised_pnl_pct.toFixed(2)}%
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[10px]" style={{ color: "var(--app-text3)" }}>
                              {activeManagedPositionId === position.id ? "Chart guides active" : "Use chart guides to drag levels"}
                            </div>
                            <button
                              onClick={() => setActiveManagedPositionId(position.id)}
                              className="px-2.5 py-1.5 rounded-[8px] text-[10px] font-semibold"
                              style={activeManagedPositionId === position.id
                                ? { background: "rgba(244,247,251,0.14)", color: "var(--accent)", border: "1px solid rgba(244,247,251,0.24)" }
                                : { background: "var(--app-surface3)", color: "var(--app-text2)", border: "1px solid var(--app-border)" }}
                            >
                              {activeManagedPositionId === position.id ? "Managing on chart" : "Manage on chart"}
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="number"
                              step="0.05"
                              value={draft.stop}
                              onChange={(e) => setCloseDraft((prev) => ({ ...prev, [position.id]: { ...draft, stop: e.target.value } }))}
                              placeholder="Stop loss"
                              className="w-full rounded-[7px] px-2.5 py-2 text-[11px] outline-none"
                              style={{ background: "var(--app-surface3)", border: "1px solid var(--app-border)", color: "var(--app-text1)" }}
                            />
                            <input
                              type="number"
                              step="0.05"
                              value={draft.target}
                              onChange={(e) => setCloseDraft((prev) => ({ ...prev, [position.id]: { ...draft, target: e.target.value } }))}
                              placeholder="Target price"
                              className="w-full rounded-[7px] px-2.5 py-2 text-[11px] outline-none"
                              style={{ background: "var(--app-surface3)", border: "1px solid var(--app-border)", color: "var(--app-text1)" }}
                            />
                            <input
                              type="number"
                              step="0.05"
                              value={draft.price}
                              onChange={(e) => setCloseDraft((prev) => ({ ...prev, [position.id]: { ...draft, price: e.target.value } }))}
                              placeholder="Exit price"
                              className="w-full rounded-[7px] px-2.5 py-2 text-[11px] outline-none"
                              style={{ background: "var(--app-surface3)", border: "1px solid var(--app-border)", color: "var(--app-text1)" }}
                            />
                            <input
                              type="text"
                              value={draft.reason}
                              onChange={(e) => setCloseDraft((prev) => ({ ...prev, [position.id]: { ...draft, reason: e.target.value } }))}
                              placeholder="Exit reason"
                              className="w-full rounded-[7px] px-2.5 py-2 text-[11px] outline-none"
                              style={{ background: "var(--app-surface3)", border: "1px solid var(--app-border)", color: "var(--app-text1)" }}
                            />
                          </div>

                          <div className="flex items-center justify-between gap-3 rounded-[10px] px-3 py-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--app-border)" }}>
                            <div className="text-[10px] leading-4" style={{ color: "var(--app-text3)" }}>
                              Stop {stopValue != null ? fmtPrice(stopValue, symbolCurrency) : "—"} · Target {targetValue != null ? fmtPrice(targetValue, symbolCurrency) : "—"}
                            </div>
                            <div className="text-[10px] font-semibold tabular-nums" style={{ color: "var(--app-text2)" }}>
                              {riskReward != null ? `R:R ${riskReward.toFixed(2)}` : "Set both levels"}
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[10px] leading-4" style={{ color: "var(--app-text3)" }}>
                              Manage stop and target from chart, then close when the trade resolves.
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={async () => {
                                  const nextStop = draft.stop.trim() ? parseFloat(draft.stop) : null;
                                  const nextTarget = draft.target.trim() ? parseFloat(draft.target) : null;
                                  if ((draft.stop.trim() && (nextStop == null || Number.isNaN(nextStop) || nextStop <= 0))
                                    || (draft.target.trim() && (nextTarget == null || Number.isNaN(nextTarget) || nextTarget <= 0))) {
                                    setOrderToast({ message: "Enter valid stop and target prices before saving levels.", journalId: position.id, broker: "simulated" });
                                    setTimeout(() => setOrderToast(null), 3500);
                                    return;
                                  }
                                  setManageBusyId(position.id);
                                  try {
                                    await updateJournalEntry(position.id, {
                                      stop_loss: nextStop,
                                      target_price: nextTarget,
                                    });
                                    setOrderToast({ message: "Position levels updated from chart.", journalId: position.id, broker: "simulated" });
                                    await loadSymbolPositions();
                                  } catch (e: unknown) {
                                    setOrderToast({ message: e instanceof Error ? e.message : "Failed to update levels", journalId: position.id, broker: "simulated" });
                                  } finally {
                                    setManageBusyId(null);
                                    setTimeout(() => setOrderToast(null), 4000);
                                  }
                                }}
                                disabled={manageBusyId === position.id}
                                className="px-3 py-2 rounded-[8px] text-[11px] font-bold transition-opacity"
                                style={{ background: "var(--app-surface3)", color: "var(--app-text1)", border: "1px solid var(--app-border)", opacity: manageBusyId === position.id ? 0.5 : 1 }}
                              >
                                {manageBusyId === position.id ? "Saving…" : "Save levels"}
                              </button>
                              <button
                                onClick={async () => {
                                  const exitPrice = parseFloat(draft.price);
                                  if (!exitPrice || exitPrice <= 0) {
                                    setOrderToast({ message: "Enter a valid exit price before closing the trade.", journalId: position.id, broker: "simulated" });
                                    setTimeout(() => setOrderToast(null), 3500);
                                    return;
                                  }
                                  setCloseBusyId(position.id);
                                  try {
                                    const result = await closePosition(position.id, exitPrice, draft.reason || undefined);
                                    setOrderToast({ message: `${result.message} - journal updated and trade review generated.`, journalId: position.id, broker: "simulated" });
                                    await loadSymbolPositions();
                                  } catch (e: unknown) {
                                    setOrderToast({ message: e instanceof Error ? e.message : "Failed to close position", journalId: position.id, broker: "simulated" });
                                  } finally {
                                    setCloseBusyId(null);
                                    setTimeout(() => setOrderToast(null), 6000);
                                  }
                                }}
                                disabled={closeBusyId === position.id}
                                className="px-3 py-2 rounded-[8px] text-[11px] font-bold transition-opacity"
                                style={{ background: "#e5383b", color: "white", opacity: closeBusyId === position.id ? 0.5 : 1 }}
                              >
                                {closeBusyId === position.id ? "Closing…" : "Close trade"}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                )}
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
                          ["Close",  fmtPrice(displayClose, symbolCurrency)],
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
                                background: latest.rsi_14 > 70 ? "rgba(139,150,166,0.2)" : latest.rsi_14 < 40 ? "rgba(217,119,6,0.2)" : "rgba(38,166,91,0.2)",
                                color: latest.rsi_14 > 70 ? "#bac4d1" : latest.rsi_14 < 40 ? "#d97706" : "#26a65b",
                              }}>
                              {latest.rsi_14.toFixed(1)}
                            </span>
                          ) : <span className="text-[11px]" style={{ color: "var(--app-text3)" }}>—</span>}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px]" style={{ color: "var(--app-text3)" }}>Vol Ratio</span>
                          <span className="text-[11px] font-medium tabular-nums" style={{ color: "#d6dce5" }}>
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
                          ["EMA 20",  latest?.ema_20,  "#f4f7fb"],
                          ["EMA 50",  latest?.ema_50,  "#bac4d1"],
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
                    {fundamentalsLoading ? (
                      <div className="space-y-1.5">
                        {[1,2,3,4,5].map(i => (
                          <div key={i} className="h-3 rounded animate-pulse" style={{ background: "var(--app-surface3)" }} />
                        ))}
                      </div>
                    ) : fundamentalsError ? (
                      <div className="text-[11px] leading-relaxed" style={{ color: "var(--app-text3)" }}>
                        {fundamentalsError}
                      </div>
                    ) : !fundamentals ? (
                      <div className="text-[11px] leading-relaxed" style={{ color: "var(--app-text3)" }}>
                        Fundamentals are temporarily unavailable. Chart and planning tools remain usable.
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
                        <div className="text-[9px] mt-1" style={{ color: "var(--app-text3)" }}>
                          Source: {fundamentals.data_status === "stale" ? "Stale fundamentals cache" : formatMarketDataSource("Yahoo Finance")}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {/* ── Broker connect panel ────────────────────────────── */}
              {!brokerConnected && (
                <div className="p-4" style={{ borderTop: "1px solid var(--app-border)" }}>
                  <div className="text-[10px] uppercase tracking-[0.5px] mb-2 font-semibold" style={{ color: "var(--app-text3)" }}>Broker import</div>
                  <div className="rounded-[8px] p-3 text-center" style={{ background: brokerStatusError ? "rgba(217,119,6,0.08)" : "rgba(0,229,196,0.08)", border: brokerStatusError ? "1px solid rgba(217,119,6,0.28)" : "1px solid rgba(0,229,196,0.2)" }}>
                    <div className="text-[12px] font-semibold mb-0.5" style={{ color: brokerStatusError ? "var(--warn)" : "var(--app-teal)" }}>
                      {brokerStatusError ? "Broker status unavailable" : brokerStatus?.token_expired ? "Reconnect your broker" : "Connect your broker"}
                    </div>
                    <div className="text-[11px] mb-2.5" style={{ color: "var(--app-text2)" }}>
                      {brokerStatusError
                        ? brokerStatusError
                        : brokerStatus?.token_expired
                        ? "Your broker session expired. Reconnect to import filled trades."
                        : "Broker import supports filled-trade import, not chart order execution."}
                    </div>
                    <Link
                      href="/settings/broker"
                      className="inline-block text-[11px] font-semibold px-3 py-1.5 rounded-[6px] hover:opacity-85 transition-opacity"
                      style={{ background: brokerStatusError ? "var(--warn)" : "var(--app-teal)", color: "#0D0F14" }}
                    >
                      {brokerStatusError ? "Open broker settings" : brokerStatus?.token_expired ? "Reconnect Zerodha" : "Connect Zerodha"}
                    </Link>
                  </div>
                </div>
              )}
            </>
          )}
        </aside>

        {/* Chart area */}
        <div className="chart-main-panel flex-1 flex flex-col min-w-0 overflow-hidden" style={{ background: "transparent" }}>
          <div
            className="chart-context-bar flex items-center justify-between gap-3 px-4 py-2.5 flex-shrink-0"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <div className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{ background: positive ? "rgba(38,166,91,0.14)" : "rgba(229,56,59,0.14)", color: positive ? "#4ade80" : "#f87171" }}>
                {fmtPrice(displayClose, symbolCurrency)} {changePct != null ? `${positive ? "+" : ""}${changePct.toFixed(2)}%` : ""}
              </div>
              {compareSymbol && (
                <div className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={compareError
                    ? { background: "rgba(217,119,6,0.12)", color: "var(--warn)" }
                    : { background: "rgba(245,158,11,0.12)", color: "#fbbf24" }}>
                  {compareError ? `Compare unavailable: ${compareSymbol}` : `Compared with ${compareSymbol}`}
                </div>
              )}
              {activeToolMeta && (
                <div className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={{ background: "rgba(139,150,166,0.14)", color: "#a5b4fc" }}>
                  {activeToolMeta.label} armed · press ESC to cancel
                </div>
              )}
              {selectedDrawing && (
                <div className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={{ background: "rgba(255,255,255,0.06)", color: "var(--app-text2)" }}>
                  Selected: {DRAW_TOOL_META[selectedDrawing.tool].label}
                </div>
              )}
              {data && (
                <div className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={{ background: "rgba(255,255,255,0.05)", color: "var(--app-text2)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  {rangeLabel} · {formatChartGranularity(timeframe)} · {formatChartCoverageRange(data.coverage, data.candles)}
                </div>
              )}
              {data && (
                <div className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={{ background: "rgba(255,255,255,0.05)", color: "var(--app-text2)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  Data as of {data.coverage?.as_of ?? data.source_metadata?.as_of ?? lastCandleDate ?? "latest available"}
                </div>
              )}
              {drawnLines.length > 0 && (
                <div className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={{ background: "rgba(255,255,255,0.05)", color: "var(--app-text2)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  Drawings · {drawnLines.length}
                </div>
              )}
              {drawingsError && (
                <div className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={{ background: "rgba(217,119,6,0.08)", color: "var(--warn)", border: "1px solid rgba(217,119,6,0.22)" }}>
                  Drawings unavailable
                </div>
              )}
              {selectedDrawing && (
                <button
                  onClick={() => void handleAlertFromSelectedDrawing()}
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold flex items-center gap-1.5"
                  style={{ background: "rgba(245,158,11,0.12)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.22)" }}
                >
                  <Bell size={12} />
                  Alert from drawing
                </button>
              )}
              {selectedDrawing?.tool === "Rectangle" && (
                <button
                  onClick={() => void createZoneNoteFromDrawing(selectedDrawing)}
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold flex items-center gap-1.5"
                  style={{ background: "rgba(139,150,166,0.14)", color: "#cbd5e1", border: "1px solid rgba(139,150,166,0.24)" }}
                >
                  <Type size={12} />
                  Zone note
                </button>
              )}
              {selectedPositionDrawing && (
                <button
                  onClick={previewSelectedPositionToDesk}
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold flex items-center gap-1.5"
                  style={{ background: "rgba(0,229,196,0.12)", color: "var(--app-teal)", border: "1px solid rgba(0,229,196,0.22)" }}
                >
                  <MoveRight size={12} />
                  Send to desk
                </button>
              )}
              {planHandoffConfirmOpen && selectedPositionDraft && (
                <div
                  className="rounded-lg px-3 py-2 text-[11px]"
                  style={{
                    background: "rgba(10,14,22,0.96)",
                    border: "1px solid rgba(0,229,196,0.22)",
                    color: "var(--app-text2)",
                    boxShadow: "0 14px 34px rgba(0,0,0,0.35)",
                    minWidth: 260,
                  }}
                >
                  <div className="flex items-center justify-between gap-3" style={{ marginBottom: 6 }}>
                    <span className="font-semibold" style={{ color: "var(--app-text)" }}>Confirm desk handoff</span>
                    <span className="uppercase" style={{ color: "var(--app-teal)", fontWeight: 700 }}>{selectedPositionDraft.side}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 mono" style={{ color: "var(--app-text2)", marginBottom: 8 }}>
                    <span>Entry {fmtPrice(selectedPositionDraft.entry, symbolCurrency)}</span>
                    <span>Stop {fmtPrice(selectedPositionDraft.stop, symbolCurrency)}</span>
                    <span>Target {fmtPrice(selectedPositionDraft.target, symbolCurrency)}</span>
                    <span>R:R {selectedPositionDraft.riskReward.toFixed(1)}</span>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setPlanHandoffConfirmOpen(false)}
                      className="rounded-full px-2.5 py-1 font-semibold"
                      style={{ border: "1px solid rgba(255,255,255,0.10)", color: "var(--app-text2)" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={sendSelectedPositionToDesk}
                      className="rounded-full px-2.5 py-1 font-semibold"
                      style={{ background: "rgba(0,229,196,0.14)", border: "1px solid rgba(0,229,196,0.28)", color: "var(--app-teal)" }}
                    >
                      Send plan
                    </button>
                  </div>
                </div>
              )}
              {selectedDrawing && (
                <button
                  onClick={() => toggleDrawingLock(selectedDrawing.id)}
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold flex items-center gap-1.5"
                  style={{ background: "rgba(255,255,255,0.06)", color: "var(--app-text2)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  {selectedDrawing.locked ? <Unlock size={12} /> : <Lock size={12} />}
                  {selectedDrawing.locked ? "Unlock" : "Lock"}
                </button>
              )}
              {selectedDrawing && (
                <button
                  onClick={() => toggleDrawingHidden(selectedDrawing.id)}
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold flex items-center gap-1.5"
                  style={{ background: "rgba(255,255,255,0.06)", color: "var(--app-text2)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  {selectedDrawing.hidden ? <Eye size={12} /> : <EyeOff size={12} />}
                  {selectedDrawing.hidden ? "Show" : "Hide"}
                </button>
              )}
              {selectedDrawing && (
                <button
                  onClick={() => void handleDeleteSingleDrawing(selectedDrawing.id)}
                  disabled={selectedDrawing.locked}
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={{ background: "rgba(229,56,59,0.14)", color: "#f87171", border: "1px solid rgba(229,56,59,0.24)", opacity: selectedDrawing.locked ? 0.45 : 1 }}
                >
                  Delete selected
                </button>
              )}
              {activeIndicatorLabels.length > 0 && (
                <div className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={indicatorError
                    ? { background: "rgba(217,119,6,0.12)", color: "var(--warn)", border: "1px solid rgba(217,119,6,0.24)" }
                    : { background: "rgba(255,255,255,0.06)", color: "var(--app-text2)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  {indicatorError ? "Indicators unavailable" : `Indicators · ${activeIndicatorLabels.join(" · ")}`}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAlertModal(true)}
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{ background: "rgba(245,158,11,0.12)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.22)" }}
              >
                <Bell size={12} />
                Alerts
              </button>
              <button
                onClick={() => setLiveMode(false)}
                disabled
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{ background: "rgba(255,255,255,0.06)", color: "var(--app-text2)", border: "1px solid rgba(255,255,255,0.08)", opacity: 0.85 }}
                title="Charts use the latest available market snapshot unless a provider source is shown."
              >
                <Activity size={12} />
                <DataProvenanceBadge kind={isMockMode ? "demo" : data?.source_metadata?.mode === "fallback" ? "fallback" : "eod"} asOf={data?.source_metadata?.as_of ?? lastCandleDate} compact />
              </button>
            </div>
          </div>
          {/* OHLCV legend / crosshair overlay */}
          <div className="chart-canvas-panel relative flex-1 min-h-0">
            {loading && data && (
              <div
                className="absolute top-3 left-1/2 -translate-x-1/2 z-30 rounded-full px-3 py-1.5 text-[11px] font-semibold pointer-events-none"
                style={{ background: "rgba(13,15,20,0.86)", color: "var(--app-text2)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(10px)" }}
              >
                Refreshing chart...
              </div>
            )}
            {error && data && (
              <div
                className="absolute top-3 left-1/2 -translate-x-1/2 z-30 rounded-full px-3 py-1.5 text-[11px] font-semibold pointer-events-none"
                style={{ background: "rgba(127,29,29,0.82)", color: "#fecaca", border: "1px solid rgba(248,113,113,0.22)", backdropFilter: "blur(10px)" }}
              >
                Could not refresh; showing cached chart
              </div>
            )}
            {indicatorError && data && (
              <div
                data-testid="chart-indicators-unavailable"
                className="absolute top-[58px] right-3 z-20 rounded-[14px] px-3 py-2 text-[11px] font-semibold"
                style={{ width: "min(360px, calc(100% - 24px))", background: "rgba(36,24,8,0.86)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.22)", backdropFilter: "blur(10px)" }}
              >
                {indicatorError} Candles, drawings, alerts, and order planning remain usable.
              </div>
            )}
            {/* Candle legend */}
            {displayBar && (
              <>
                <div className="absolute top-2 left-3 z-10 pointer-events-none rounded-[14px] px-3 py-2 text-[11px] font-mono"
                  style={{ background: "rgba(13,15,20,0.82)", color: "rgba(255,255,255,0.48)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(12px)" }}>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-semibold" style={{ color: "rgba(255,255,255,0.92)" }}>{symbol}</span>
                    <span>{displayBar.time}</span>
                    <span>O <span style={{ color: "rgba(255,255,255,0.88)" }}>{displayBar.open?.toFixed(2)}</span></span>
                    <span>H <span style={{ color: "rgba(255,255,255,0.88)" }}>{displayBar.high?.toFixed(2)}</span></span>
                    <span>L <span style={{ color: "rgba(255,255,255,0.88)" }}>{displayBar.low?.toFixed(2)}</span></span>
                    <span>C <span style={{ color: displayBar.close >= displayBar.open ? "#26a65b" : "#e5383b" }}>{displayBar.close?.toFixed(2)}</span></span>
                    <span>Vol <span style={{ color: "rgba(255,255,255,0.88)" }}>{fmtVol(displayBar.volume)}</span></span>
                  </div>
                </div>
              </>
            )}

            {(rangeNote || timeframeMessage) && (
              <div
                className="absolute top-[58px] left-3 z-10 pointer-events-none rounded-[14px] px-3 py-2 text-[11px] font-semibold"
                style={{ background: "rgba(13,15,20,0.78)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.18)", backdropFilter: "blur(10px)" }}
              >
                {timeframeMessage || rangeNote}
              </div>
            )}

            {textEditor && (
              <div
                className="absolute z-30 rounded-[14px] p-3"
                style={{
                  left: textEditor.x,
                  top: textEditor.y,
                  width: 220,
                  background: "rgba(13,15,20,0.96)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow: "var(--shadow-panel)",
                }}
              >
                <div className="label" style={{ fontSize: 9, marginBottom: 6 }}>Text Note</div>
                <textarea
                  autoFocus
                  value={textEditor.value}
                  onChange={(e) => setTextEditor((prev) => prev ? { ...prev, value: e.target.value } : prev)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      void commitTextEditor();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setTextEditor(null);
                    }
                  }}
                  rows={3}
                  className="w-full rounded-[10px] px-3 py-2 text-[12px] outline-none resize-none"
                  style={{ background: "var(--app-surface3)", border: "1px solid var(--app-border)", color: "var(--app-text1)" }}
                />
                <div className="flex items-center justify-between mt-2">
                  <div style={{ fontSize: 10, color: "var(--app-text3)" }}>Cmd/Ctrl+Enter to save</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setTextEditor(null)}
                      className="px-2.5 py-1 rounded-[8px] text-[11px]"
                      style={{ color: "var(--app-text3)", border: "1px solid var(--app-border)" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => void commitTextEditor()}
                      className="px-2.5 py-1 rounded-[8px] text-[11px] font-semibold"
                      style={{ background: "var(--app-teal)", color: "#0D0F14" }}
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Drawing SVG overlay */}
            <div
              ref={overlayRef}
              data-testid="chart-drawing-overlay"
              className="absolute inset-0 z-20"
              style={{ cursor: activeDrawingTool ? "crosshair" : dragState || positionDragState || planDragState ? "grabbing" : "default", pointerEvents: activeDrawingTool || selectedDrawing || dragState || positionDragState || planDragState || activeManagedPosition ? "all" : "none" }}
              onMouseDownCapture={(e) => {
                if (!activeDrawingTool) return;
                e.stopPropagation();
                handleOverlayMouseDown(e);
              }}
              onMouseMoveCapture={(e) => {
                if (!activeDrawingTool) return;
                e.stopPropagation();
                handleOverlayMouseMove(e);
              }}
              onMouseUpCapture={(e) => {
                if (!activeDrawingTool) return;
                e.stopPropagation();
                void handleOverlayMouseUp(e);
              }}
              onMouseDown={handleOverlayMouseDown}
              onMouseMove={handleOverlayMouseMove}
              onMouseUp={handleOverlayMouseUp}
              onMouseLeave={() => { setDragState(null); setPositionDragState(null); setPlanDragState(null); }}
            >
              {/* Preview line while drawing */}
              {drawingPreview && (
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                  {activeDrawingTool === "Rectangle" ? (
                    <rect
                      x={Math.min(drawingPreview.x1, drawingPreview.x2)}
                      y={Math.min(drawingPreview.y1, drawingPreview.y2)}
                      width={Math.abs(drawingPreview.x2 - drawingPreview.x1)}
                      height={Math.abs(drawingPreview.y2 - drawingPreview.y1)}
                      fill="rgba(139,150,166,0.12)"
                      stroke="#f4f7fb"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      rx={3}
                    />
                  ) : activeDrawingTool === "Text" ? (
                    <g>
                      <circle cx={drawingPreview.x1} cy={drawingPreview.y1} r={4} fill="#f4f7fb" />
                      <rect x={drawingPreview.x1 + 8} y={drawingPreview.y1 - 24} width={92} height={20} rx={6} fill="rgba(13,15,20,0.9)" stroke="#f4f7fb" />
                      <text x={drawingPreview.x1 + 14} y={drawingPreview.y1 - 11} fontSize="10" fill="#f8fafc" fontFamily="var(--font-sans), sans-serif">Text note</text>
                    </g>
                  ) : activeDrawingTool === "LongPosition" || activeDrawingTool === "ShortPosition" ? (
                    (() => {
                      const x = Math.min(drawingPreview.x1, drawingPreview.x2);
                      const w = Math.max(72, Math.abs(drawingPreview.x2 - drawingPreview.x1));
                      const rewardY = activeDrawingTool === "LongPosition"
                        ? drawingPreview.y1 - Math.abs(drawingPreview.y2 - drawingPreview.y1) * 2
                        : drawingPreview.y1 + Math.abs(drawingPreview.y2 - drawingPreview.y1) * 2;
                      const rewardTop = Math.min(drawingPreview.y1, rewardY);
                      const riskTop = Math.min(drawingPreview.y1, drawingPreview.y2);
                      return (
                        <g>
                          <rect x={x} y={rewardTop} width={w} height={Math.abs(rewardY - drawingPreview.y1)} fill="rgba(34,197,94,0.14)" stroke="#22c55e" strokeDasharray="4 3" />
                          <rect x={x} y={riskTop} width={w} height={Math.abs(drawingPreview.y2 - drawingPreview.y1)} fill="rgba(239,68,68,0.14)" stroke="#ef4444" strokeDasharray="4 3" />
                          <line x1={x} y1={drawingPreview.y1} x2={x + w} y2={drawingPreview.y1} stroke="#e5e7eb" strokeWidth={1.4} />
                          <text x={x + 8} y={drawingPreview.y1 - 6} fontSize="10" fill="#e5e7eb" fontFamily="var(--font-sans), sans-serif">{activeDrawingTool === "LongPosition" ? "Long" : "Short"} entry</text>
                        </g>
                      );
                    })()
                  ) : (
                    <line
                      x1={drawingPreview.x1} y1={drawingPreview.y1}
                      x2={drawingPreview.x2}
                      y2={(activeDrawingTool === "Horizontal" || activeDrawingTool === "HorizontalRay") ? drawingPreview.y1 : drawingPreview.y2}
                      stroke="#f4f7fb" strokeWidth={1.5} strokeDasharray="4 3"
                    />
                  )}
                </svg>
              )}

              {/* Persisted drawings — projected from price/time coords each render */}
              <svg className="absolute inset-0 w-full h-full">
                {activeManagedPosition && activeManagedDraft && (() => {
                  const chartW = overlayRef.current?.clientWidth ?? 0;
                  const lineDefs = [
                    { key: "entry", label: "Entry", price: activeManagedPosition.entry_price, color: "#94a3b8", draggable: false },
                    { key: "stop", label: "Stop", price: activeManagedDraft.stop ? parseFloat(activeManagedDraft.stop) : null, color: "#e5383b", draggable: true },
                    { key: "target", label: "Target", price: activeManagedDraft.target ? parseFloat(activeManagedDraft.target) : null, color: "#26a65b", draggable: true },
                  ] as const;
                  return lineDefs.map((line) => {
                    if (line.price == null || Number.isNaN(line.price)) return null;
                    const y = chartHandleRef.current?.priceToCoordinate(line.price) ?? null;
                    if (y == null) return null;
                    return (
                      <g key={line.key} style={{ pointerEvents: "all" }}>
                        <line
                          x1={0}
                          y1={y}
                          x2={chartW}
                          y2={y}
                          stroke={line.color}
                          strokeWidth={line.key === "entry" ? 1.2 : 1.6}
                          strokeDasharray={line.key === "entry" ? "4 4" : "8 4"}
                          opacity={0.92}
                        />
                        <rect
                          x={Math.max(8, chartW - 104)}
                          y={y - 12}
                          width={104}
                          height={24}
                          rx={10}
                          fill="rgba(13,15,20,0.94)"
                          stroke={line.color}
                        />
                        <text
                          x={Math.max(16, chartW - 96)}
                          y={y + 5}
                          fontSize="10.5"
                          fill={line.color}
                          fontFamily="var(--font-sans), sans-serif"
                          fontWeight="700"
                        >
                          {line.label} {line.price.toFixed(2)}
                        </text>
                        {line.draggable && (
                          <>
                            <circle
                              cx={chartW - 118}
                              cy={y}
                              r={9}
                              fill="rgba(13,15,20,0.96)"
                              opacity={0.22}
                            />
                            <circle
                              cx={chartW - 118}
                            cy={y}
                            r={6.5}
                            fill="#0D0F14"
                            stroke={line.color}
                            strokeWidth={1.8}
                            style={{ cursor: "ns-resize" }}
                            onMouseDown={(event) => {
                              event.stopPropagation();
                              setPositionDragState({ positionId: activeManagedPosition.id, field: line.key });
                            }}
                          />
                          </>
                        )}
                      </g>
                    );
                  });
                })()}
                {visibleDrawings.map(line => {
                  const chartW = overlayRef.current?.clientWidth ?? 0;
                  const x1 = chartHandleRef.current?.timeToCoordinate(line.p1.time) ?? null;
                  const y1 = chartHandleRef.current?.priceToCoordinate(line.p1.price) ?? null;
                  if (x1 == null || y1 == null) return null;

                  const selected = selectedDrawingId === line.id;
                  const stroke = selected ? "#e5e7eb" : line.color;
                  const strokeWidth = selected ? 2.2 : 1.5;
                  const editable = selected && !line.locked;

                  if (line.tool === "Horizontal") {
                    return (
                      <g key={line.id} style={{ pointerEvents: "all", cursor: editable ? "grab" : "pointer" }} onClick={() => setSelectedDrawingId(line.id)} onMouseDown={(e) => beginWholeDrawingDrag(e, line)}>
                        <line x1={0} y1={y1} x2={chartW} y2={y1}
                          stroke={stroke} strokeWidth={strokeWidth} />
                        <text x={chartW - 4} y={y1 - 4} textAnchor="end"
                          fontSize="10" fill={stroke} fontFamily="monospace">
                          {line.p1.price.toFixed(2)}
                        </text>
                        {editable && (
                          <circle
                            cx={chartW - 18}
                            cy={y1}
                            r={5}
                            fill="#0D0F14"
                            stroke="#e5e7eb"
                            strokeWidth={1.5}
                            style={{ pointerEvents: "all", cursor: "ns-resize" }}
onMouseDown={(e) => { e.stopPropagation(); beginPointDrag(e, line, "p1"); }}
                          />
                        )}
                      </g>
                    );
                  }

                  const x2 = chartHandleRef.current?.timeToCoordinate(line.p2.time) ?? null;
                  const y2 = chartHandleRef.current?.priceToCoordinate(line.p2.price) ?? null;
                  if (x2 == null || y2 == null) return null;

                  if (line.tool === "HorizontalRay") {
                    return (
                      <g key={line.id} style={{ pointerEvents: "all", cursor: editable ? "grab" : "pointer" }} onClick={() => setSelectedDrawingId(line.id)} onMouseDown={(e) => beginWholeDrawingDrag(e, line)}>
                        <line x1={x1} y1={y1} x2={chartW} y2={y1} stroke={stroke} strokeWidth={strokeWidth} />
                        <circle cx={x1} cy={y1} r={3} fill={stroke} />
                        {editable && (
                          <>
                            <circle
                              cx={x1}
                              cy={y1}
                              r={5}
                              fill="#0D0F14"
                              stroke="#e5e7eb"
                              strokeWidth={1.5}
                              style={{ pointerEvents: "all", cursor: "move" }}
onMouseDown={(e) => { e.stopPropagation(); beginPointDrag(e, line, "p1"); }}
                            />
                            <circle
                              cx={x2}
                              cy={y1}
                              r={5}
                              fill="#0D0F14"
                              stroke="#e5e7eb"
                              strokeWidth={1.5}
                              style={{ pointerEvents: "all", cursor: "ew-resize" }}
onMouseDown={(e) => { e.stopPropagation(); beginPointDrag(e, line, "p2"); }}
                            />
                          </>
                        )}
                      </g>
                    );
                  }

                  if (line.tool === "Ray") {
                    const dx = x2 - x1;
                    const dy = y2 - y1;
                    const slope = dx === 0 ? 0 : dy / dx;
                    const rayY = y1 + slope * (chartW - x1);
                    return (
                      <g key={line.id} style={{ pointerEvents: "all", cursor: editable ? "grab" : "pointer" }} onClick={() => setSelectedDrawingId(line.id)} onMouseDown={(e) => beginWholeDrawingDrag(e, line)}>
                        <line x1={x1} y1={y1} x2={chartW} y2={rayY} stroke={stroke} strokeWidth={strokeWidth} />
                        <circle cx={x1} cy={y1} r={3} fill={stroke} />
                        {editable && (
                          <>
                            <circle
                              cx={x1}
                              cy={y1}
                              r={5}
                              fill="#0D0F14"
                              stroke="#e5e7eb"
                              strokeWidth={1.5}
                              style={{ pointerEvents: "all", cursor: "move" }}
                              onMouseDown={(e) => { e.stopPropagation(); beginPointDrag(e, line, "p1"); }}
                            />
                            <circle
                              cx={x2}
                              cy={y2}
                              r={5}
                              fill="#0D0F14"
                              stroke="#e5e7eb"
                              strokeWidth={1.5}
                              style={{ pointerEvents: "all", cursor: "move" }}
                              onMouseDown={(e) => { e.stopPropagation(); beginPointDrag(e, line, "p2"); }}
                            />
                          </>
                        )}
                      </g>
                    );
                  }

                  if (line.tool === "Rectangle") {
                    const rectX = Math.min(x1, x2);
                    const rectY = Math.min(y1, y2);
                    const rectW = Math.max(8, Math.abs(x2 - x1));
                    const rectH = Math.max(8, Math.abs(y2 - y1));
                    return (
                      <g key={line.id} style={{ pointerEvents: "all", cursor: editable ? "grab" : "pointer" }} onClick={() => setSelectedDrawingId(line.id)} onMouseDown={(e) => beginWholeDrawingDrag(e, line)}>
                        <rect
                          x={rectX}
                          y={rectY}
                          width={rectW}
                          height={rectH}
                          fill={selected ? "rgba(196,181,253,0.16)" : "rgba(139,150,166,0.12)"}
                          stroke={stroke}
                          strokeWidth={strokeWidth}
                          rx={3}
                        />
                        {editable && (
                          <>
                            <circle
                              cx={x1}
                              cy={y1}
                              r={5}
                              fill="#0D0F14"
                              stroke="#e5e7eb"
                              strokeWidth={1.5}
                              style={{ pointerEvents: "all", cursor: "nwse-resize" }}
                              onMouseDown={(e) => { e.stopPropagation(); beginPointDrag(e, line, "p1"); }}
                            />
                            <circle
                              cx={x2}
                              cy={y2}
                              r={5}
                              fill="#0D0F14"
                              stroke="#e5e7eb"
                              strokeWidth={1.5}
                              style={{ pointerEvents: "all", cursor: "nwse-resize" }}
                              onMouseDown={(e) => { e.stopPropagation(); beginPointDrag(e, line, "p2"); }}
                            />
                          </>
                        )}
                      </g>
                    );
                  }

                  if (line.tool === "Fib") {
                    const levels = [0, 0.236, 0.382, 0.5, 0.618, 1];
                    const priceRange = line.p2.price - line.p1.price;
                    return (
                      <g key={line.id} style={{ pointerEvents: "all", cursor: editable ? "grab" : "pointer" }} onClick={() => setSelectedDrawingId(line.id)} onMouseDown={(e) => beginWholeDrawingDrag(e, line)}>
                        {levels.map(lvl => {
                          const priceLvl = line.p1.price + priceRange * (1 - lvl);
                          const yLvl = chartHandleRef.current?.priceToCoordinate(priceLvl) ?? null;
                          if (yLvl == null) return null;
                          const colors: Record<number, string> = {
                            0: "#888", 0.236: "#f4f7fb", 0.382: "#26a65b",
                            0.5: "#d97706", 0.618: "#e5383b", 1: "#888"
                          };
                          return (
                            <g key={lvl}>
                              <line x1={x1} y1={yLvl} x2={x2} y2={yLvl}
                                stroke={selected ? "#e5e7eb" : (colors[lvl] || "#f4f7fb")} strokeWidth={selected ? 1.5 : 1} strokeDasharray="3 2" />
                              <text x={x2 + 4} y={yLvl + 4} fontSize="9" fill={selected ? "#e5e7eb" : (colors[lvl] || "#f4f7fb")} fontFamily="monospace">
                                {(lvl * 100).toFixed(1)}%
                              </text>
                            </g>
                          );
                        })}
                        {editable && (
                          <>
                            <circle
                              cx={x1}
                              cy={y1}
                              r={5}
                              fill="#0D0F14"
                              stroke="#e5e7eb"
                              strokeWidth={1.5}
                              style={{ pointerEvents: "all", cursor: "move" }}
                              onMouseDown={(e) => { e.stopPropagation(); beginPointDrag(e, line, "p1"); }}
                            />
                            <circle
                              cx={x2}
                              cy={y2}
                              r={5}
                              fill="#0D0F14"
                              stroke="#e5e7eb"
                              strokeWidth={1.5}
                              style={{ pointerEvents: "all", cursor: "move" }}
                              onMouseDown={(e) => { e.stopPropagation(); beginPointDrag(e, line, "p2"); }}
                            />
                          </>
                        )}
                      </g>
                    );
                  }

                  if (isPositionDrawingTool(line.tool)) {
                    const targetY = line.p3 ? chartHandleRef.current?.priceToCoordinate(line.p3.price) ?? null : null;
                    if (targetY == null) return null;
                    const x = Math.min(x1, x2);
                    const rectW = Math.max(88, Math.abs(x2 - x1));
                    const rewardTop = Math.min(y1, targetY);
                    const rewardH = Math.max(4, Math.abs(targetY - y1));
                    const riskTop = Math.min(y1, y2);
                    const riskH = Math.max(4, Math.abs(y2 - y1));
                    const risk = Math.abs(line.p1.price - line.p2.price);
                    const reward = Math.abs((line.p3?.price ?? line.p1.price) - line.p1.price);
                    const rr = risk > 0 ? reward / risk : 0;
                    const tagX = Math.max(4, Math.min(chartW - 112, x + rectW + 6));

                    return (
                      <g key={line.id} style={{ pointerEvents: "all", cursor: editable ? "grab" : "pointer" }} onClick={() => setSelectedDrawingId(line.id)} onMouseDown={(e) => beginWholeDrawingDrag(e, line)}>
                        <rect x={x} y={rewardTop} width={rectW} height={rewardH} fill="rgba(34,197,94,0.16)" stroke={selected ? "#bbf7d0" : "#22c55e"} strokeWidth={strokeWidth} />
                        <rect x={x} y={riskTop} width={rectW} height={riskH} fill="rgba(239,68,68,0.16)" stroke={selected ? "#fecaca" : "#ef4444"} strokeWidth={strokeWidth} />
                        <line x1={x} y1={y1} x2={x + rectW} y2={y1} stroke="#e5e7eb" strokeWidth={1.4} />
                        <line x1={x} y1={y2} x2={x + rectW} y2={y2} stroke="#ef4444" strokeWidth={1.2} strokeDasharray="5 3" />
                        <line x1={x} y1={targetY} x2={x + rectW} y2={targetY} stroke="#22c55e" strokeWidth={1.2} strokeDasharray="5 3" />
                        <rect x={tagX} y={Math.max(6, y1 - 34)} width={108} height={50} rx={8} fill="rgba(13,15,20,0.92)" stroke={selected ? "#e5e7eb" : "rgba(255,255,255,0.12)"} />
                        <text x={tagX + 8} y={Math.max(20, y1 - 18)} fontSize="10" fill={line.tool === "LongPosition" ? "#22c55e" : "#ef4444"} fontFamily="var(--font-sans), sans-serif" fontWeight="700">
                          {line.tool === "LongPosition" ? "Long" : "Short"} · {rr.toFixed(2)}R
                        </text>
                        <text x={tagX + 8} y={Math.max(34, y1 - 4)} fontSize="9" fill="#e5e7eb" fontFamily="var(--font-sans), sans-serif">
                          Entry {line.p1.price.toFixed(2)}
                        </text>
                        <text x={tagX + 8} y={Math.max(48, y1 + 10)} fontSize="9" fill="#94a3b8" fontFamily="var(--font-sans), sans-serif">
                          Stop {line.p2.price.toFixed(2)}
                        </text>
                        {editable && (
                          <>
                            <circle
                              cx={x1}
                              cy={y1}
                              r={5}
                              fill="#0D0F14"
                              stroke="#e5e7eb"
                              strokeWidth={1.5}
                              style={{ pointerEvents: "all", cursor: "move" }}
                              onMouseDown={(e) => { e.stopPropagation(); beginPointDrag(e, line, "p1"); }}
                            />
                            <circle
                              cx={x2}
                              cy={y2}
                              r={5}
                              fill="#0D0F14"
                              stroke="#e5e7eb"
                              strokeWidth={1.5}
                              style={{ pointerEvents: "all", cursor: "ns-resize" }}
                              onMouseDown={(e) => { e.stopPropagation(); beginPointDrag(e, line, "p2"); }}
                            />
                            <circle
                              cx={x2}
                              cy={targetY}
                              r={5}
                              fill="#0D0F14"
                              stroke="#bbf7d0"
                              strokeWidth={1.5}
                              style={{ pointerEvents: "all", cursor: "ns-resize" }}
                              onMouseDown={(e) => { e.stopPropagation(); beginPointDrag(e, line, "p3"); }}
                            />
                          </>
                        )}
                      </g>
                    );
                  }

                  if (line.tool === "Text") {
                    return (
                      <g key={line.id} style={{ pointerEvents: "all", cursor: editable ? "grab" : "pointer" }} onClick={() => setSelectedDrawingId(line.id)} onDoubleClick={() => editTextDrawing(line)} onMouseDown={(e) => beginWholeDrawingDrag(e, line)}>
                        <circle cx={x1} cy={y1} r={3} fill={stroke} />
                        <rect
                          x={Math.min(chartW - 120, x1 + 8)}
                          y={Math.max(6, y1 - 22)}
                          width={110}
                          height={20}
                          rx={6}
                          fill="rgba(13,15,20,0.9)"
                          stroke={stroke}
                        />
                        <text
                          x={Math.min(chartW - 112, x1 + 14)}
                          y={Math.max(20, y1 - 9)}
                          fontSize="10"
                          fill="#f8fafc"
                          fontFamily="var(--font-sans), sans-serif"
                        >
                          {line.text ?? "Note"}
                        </text>
                        {editable && (
                          <circle
                            cx={x1}
                            cy={y1}
                            r={5}
                            fill="#0D0F14"
                            stroke="#e5e7eb"
                            strokeWidth={1.5}
                            style={{ pointerEvents: "all", cursor: "move" }}
                            onMouseDown={(e) => { e.stopPropagation(); beginPointDrag(e, line, "p1"); }}
                          />
                        )}
                      </g>
                    );
                  }

                  // Trendline
                  return (
                    <g key={line.id} style={{ pointerEvents: "all", cursor: editable ? "grab" : "pointer" }} onClick={() => setSelectedDrawingId(line.id)} onMouseDown={(e) => beginWholeDrawingDrag(e, line)}>
                      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={strokeWidth} />
                      {selected && (
                        <>
                          <circle cx={x1} cy={y1} r={3} fill={stroke} />
                          <circle cx={x2} cy={y2} r={3} fill={stroke} />
                        </>
                      )}
                      {editable && (
                        <>
                          <circle
                            cx={x1}
                            cy={y1}
                            r={5}
                            fill="#0D0F14"
                            stroke="#e5e7eb"
                            strokeWidth={1.5}
                            style={{ pointerEvents: "all", cursor: "move" }}
                            onMouseDown={(e) => { e.stopPropagation(); beginPointDrag(e, line, "p1"); }}
                          />
                          <circle
                            cx={x2}
                            cy={y2}
                            r={5}
                            fill="#0D0F14"
                            stroke="#e5e7eb"
                            strokeWidth={1.5}
                            style={{ pointerEvents: "all", cursor: "move" }}
                            onMouseDown={(e) => { e.stopPropagation(); beginPointDrag(e, line, "p2"); }}
                          />
                        </>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Main chart */}
            {data && (
              <CandlestickChart
                key={`${symbol}-${rangeLabel}-${timeframe}-${chartType}-${theme}-${liveMode ? "live" : "eod"}`}
                candles={data.candles}
                indicators={indicatorData}
                activeIndicators={activeIndicators}
                chartType={chartType}
                dark={theme !== "light"}
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
    </div>
  );
}
