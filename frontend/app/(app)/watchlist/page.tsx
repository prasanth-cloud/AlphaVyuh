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
import { PencilLine, Plus, Trash2, GripVertical, X, Search, Pin, PinOff, Tag } from "lucide-react";
import dynamic from "next/dynamic";
import type { Watchlist, WatchlistItem, CandleBar, JournalEntry, Fundamentals } from "@/lib/api";
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
  prefetchCandles,
  placeOrder,
  getQuoteLive,
  getFundamentals,
  getBrokerStatus,
  getWorkflowStates,
  isMockMode,
  liveQuotePollingEnabled,
  type PlaceOrderRequest,
  type WatchlistItemMetadataUpdate,
  type WorkflowLifecycle,
  type WorkflowState,
  upsertWorkflowState,
} from "@/lib/api";
import type { SymbolSearchResult } from "@/lib/api";
import { DataProvenanceBadge, EmptyState, Num } from "@/components/ui";
import IndicatorMenu from "@/components/charts/IndicatorMenu";
import ChartTimeframeDropdown from "@/components/charts/ChartTimeframeDropdown";
import { useChartWorkspace } from "@/components/charts/hooks/useChartWorkspace";
import { workflowPlanStatus } from "@/lib/workflow";
import { trackEvent } from "@/lib/analytics";
import {
  formatCandleRange,
  formatChartCoverageRange,
  formatChartGranularity,
  getCoverageAvailabilityMessage,
  getRangeAvailabilityMessage,
  getWatchlistChartRequest,
  type WatchlistChartTimeframe,
  type WatchlistChartRequest,
} from "@/lib/watchlist-chart-range";
import { formatMarketDataMode, formatMarketDataSource } from "@/lib/data-copy";
import { describeMarketDataError } from "@/lib/data-errors";
import { buildWorkflowPatchFromChartDraft, parseChartPlanDraft } from "@/lib/chart-plan-handoff";

type ChartDisplayType = "candles" | "bars" | "line";
type SetupSignal = { label: string; tone: "gain" | "loss" | "accent" | "neutral"; score: number };

const MiniChart = dynamic(() => import("@/components/charts/MiniChart"), { ssr: false });
const STARTER_SYMBOLS = ["RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK", "TATAMOTORS"];
const WATCHLIST_PAGE_SIZE = 5;
const WATCHLIST_CHART_TYPE_STORAGE_KEY = "alphavyuh-watchlist-chart-type";

function normalizeChartDisplayType(value: string | null | undefined): ChartDisplayType | null {
  return value === "bars" || value === "line" || value === "candles" ? value : null;
}

function readWatchlistChartType(): ChartDisplayType {
  if (typeof window === "undefined") return "candles";
  return normalizeChartDisplayType(window.localStorage.getItem(WATCHLIST_CHART_TYPE_STORAGE_KEY)) ?? "candles";
}

function getSetupSignal(item: WatchlistItem): SetupSignal {
  const move = item.pct_change ?? 0;
  const volume = item.volume_ratio ?? 0;
  const rsi = item.rsi_14 ?? 50;

  if (move >= 2 && volume >= 1.5 && rsi >= 58) return { label: "2% up + vol", tone: "gain", score: 95 };
  if (move >= 0.5 && volume >= 1.2 && rsi >= 55) return { label: "RSI 55+ + vol", tone: "accent", score: 82 };
  if (move <= -2 && volume >= 1.3) return { label: "2% down + vol", tone: "loss", score: 28 };
  if (move > -1 && move < 1 && rsi >= 42 && rsi <= 58) return { label: "Flat range", tone: "neutral", score: 64 };
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

function watchlistInitial(name: string | null | undefined): string {
  const trimmed = (name || "Watchlist").trim();
  return (trimmed.match(/[A-Za-z0-9]/)?.[0] || "W").toUpperCase();
}

function watchlistAccent(name: string | null | undefined): string {
  const seed = (name || "watchlist").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const colors = ["#26a65b", "#5b63f5", "#d97706", "#14b8a6", "#e11d48", "#8b5cf6"];
  return colors[seed % colors.length];
}

function WatchlistAvatar({ name, active = false, size = 26 }: { name: string | null | undefined; active?: boolean; size?: number }) {
  const color = watchlistAccent(name);
  return (
    <span
      aria-hidden="true"
      title={name || "Watchlist"}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        fontSize: Math.max(10, Math.round(size * 0.42)),
        fontWeight: 800,
        color: active ? "var(--bg-primary)" : color,
        background: active ? color : `${color}1f`,
        border: `1px solid ${active ? color : `${color}66`}`,
        boxShadow: active ? `0 0 0 2px ${color}24` : "none",
      }}
    >
      {watchlistInitial(name)}
    </span>
  );
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
            title={`Metric match ${setup.score}`}
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

const LIFECYCLES: WorkflowLifecycle[] = ["idea", "watch", "ready", "triggered", "open", "closed", "reviewed", "invalidated"];

function lifecycleLabel(value: WorkflowLifecycle) {
  return value.replace("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function DecisionDesk({
  symbol,
  watchlistId,
  plan,
  onPlanChange,
  onToast,
}: {
  symbol: string;
  watchlistId: string | null;
  plan: WorkflowState | null;
  onPlanChange: (plan: WorkflowState) => void;
  onToast: (msg: string) => void;
}) {
  const status = workflowPlanStatus(plan);
  const draft = plan ?? { symbol, watchlist_id: watchlistId, lifecycle: "watch", timeframe: "D", tags: [] };
  const requiredFields = [
    { key: "entry", label: "Entry", complete: Boolean(draft.entry && draft.entry > 0) },
    { key: "stop", label: "Stop", complete: Boolean(draft.stop && draft.stop > 0) },
    { key: "target", label: "Target", complete: Boolean(draft.target && draft.target > 0) },
    { key: "position_size", label: "Size", complete: Boolean(draft.position_size && draft.position_size > 0) },
    { key: "thesis", label: "Thesis", complete: Boolean(draft.thesis?.trim()) },
    { key: "invalidation_rule", label: "Invalidation", complete: Boolean(draft.invalidation_rule?.trim()) },
  ];
  const invalidRisk =
    draft.entry != null && draft.stop != null && draft.entry > 0 && draft.stop > 0 && draft.entry <= draft.stop;
  const invalidReward =
    draft.entry != null && draft.target != null && draft.entry > 0 && draft.target > 0 && draft.target <= draft.entry;
  const riskReward =
    draft.entry && draft.stop && draft.target && draft.entry > draft.stop && draft.target > draft.entry
      ? (Math.abs(draft.target - draft.entry) / Math.abs(draft.entry - draft.stop)).toFixed(2)
      : null;
  const riskRewardValue = riskReward ? Number(riskReward) : null;
  const planNudges = [
    ...requiredFields
      .filter((field) => !field.complete)
      .slice(0, 3)
      .map((field) => `Complete ${field.label.toLowerCase()}`),
    ...(invalidRisk ? ["Stop must sit below entry for a long plan"] : []),
    ...(invalidReward ? ["Target must sit above entry for a long plan"] : []),
    ...(riskRewardValue != null && riskRewardValue < 2 ? ["R:R is below 2.0; confirm the trade is still worth taking"] : []),
    ...(draft.confidence != null && draft.confidence <= 2 ? ["Setup quality is low; keep it in watch/review"] : []),
  ].slice(0, 4);
  const inputStyle: React.CSSProperties = {
    width: "100%",
    fontSize: 12,
    borderRadius: "var(--radius-sm)",
    padding: "6px 8px",
    background: "var(--surface-3)",
    border: "1px solid var(--border-subtle)",
    color: "var(--text-primary)",
    outline: "none",
  };

  async function patch(updates: Partial<WorkflowState>) {
    const next = await upsertWorkflowState({
      ...draft,
      ...updates,
      symbol,
      watchlist_id: watchlistId,
      source: draft.source ?? "watchlist",
    });
    onPlanChange(next);
  }

  async function markReady() {
    if (!status.valid) return;
    await patch({ lifecycle: "ready" });
    trackEvent("decision_desk_plan_ready", { symbol, watchlist_id: watchlistId ?? null });
    onToast(`${symbol} marked ready`);
  }

  return (
    <section style={{ borderTop: "1px solid rgba(255,255,255,0.07)", padding: "12px 14px", background: "rgba(255,255,255,0.02)", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <div>
          <div className="label" style={{ marginBottom: 3 }}>Decision desk</div>
          <div className="caption">{status.next}</div>
        </div>
        <div className="workspace-pill-row" style={{ marginTop: 0 }}>
          <button className={`workspace-chip-button${status.valid ? " active" : ""}`} disabled={!status.valid} onClick={markReady} style={{ opacity: status.valid ? 1 : 0.45 }}>
            Ready
          </button>
          <button className="workspace-chip-button" disabled={!status.valid} onClick={() => onToast(status.valid ? "Order draft is unlocked in the chart order panel." : status.next)} style={{ opacity: status.valid ? 1 : 0.45 }}>
            Draft order
          </button>
        </div>
      </div>
      <div className="decision-desk-progress" style={{ marginBottom: 10 }}>
        {requiredFields.map((field) => (
          <span key={field.key} className={`decision-desk-chip${field.complete ? " complete" : ""}`}>
            {field.complete ? "✓" : "•"} {field.label}
          </span>
        ))}
        {riskReward && <span className="decision-desk-chip complete">R:R {riskReward}</span>}
        {(invalidRisk || invalidReward) && (
          <span className="decision-desk-chip invalid">
            {invalidRisk ? "Stop must be below entry" : "Target must be above entry"}
          </span>
        )}
      </div>
      <div
        data-testid="decision-desk-nudges"
        style={{
          marginBottom: 10,
          padding: "8px 10px",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.07)",
          background: status.valid ? "rgba(27,191,114,0.055)" : "rgba(217,119,6,0.08)",
        }}
      >
        <div className="label" style={{ marginBottom: 4 }}>{status.valid ? "Plan ready" : "Next best action"}</div>
        <div className="caption" style={{ color: status.valid ? "var(--gain)" : "var(--warn)", lineHeight: 1.55 }}>
          {status.valid
            ? (riskReward ? `Ready for journal capture draft. Risk/reward ${riskReward}.` : "Ready for journal capture draft.")
            : (planNudges.length ? planNudges.join(" · ") : status.next)}
        </div>
      </div>
      {draft.scanner_context && (
        <div
          data-testid="trade-idea-context"
          style={{
            marginBottom: 10,
            padding: "8px 10px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.07)",
            background: "rgba(255,255,255,0.035)",
          }}
        >
          <div className="label" style={{ marginBottom: 5 }}>Original scan</div>
          <div className="workspace-pill-row" style={{ marginTop: 0 }}>
            {draft.scanner_context.preset_name && (
              <span className="workspace-pill">{draft.scanner_context.preset_name}</span>
            )}
            {(draft.scanner_context.setup_grade || draft.scanner_context.setup_score != null) && (
              <span className="workspace-pill">
                {[draft.scanner_context.setup_grade, draft.scanner_context.setup_score].filter((value) => value != null && value !== "").join(" ")}
              </span>
            )}
            {draft.scanner_context.data_as_of && (
              <span className="workspace-pill">As of {draft.scanner_context.data_as_of}</span>
            )}
          </div>
          {draft.scanner_context.match_reasons?.[0] && (
            <div className="caption" style={{ marginTop: 6, lineHeight: 1.55 }}>
              {draft.scanner_context.match_reasons[0]}
            </div>
          )}
        </div>
      )}
      <div className="decision-desk-primary-grid" style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 8 }}>
        <select value={draft.lifecycle} onChange={(e) => patch({ lifecycle: e.target.value as WorkflowLifecycle })} style={inputStyle}>
          {LIFECYCLES.map((item) => <option key={item} value={item}>{lifecycleLabel(item)}</option>)}
        </select>
        <select value={draft.setup_type ?? ""} onChange={(e) => patch({ setup_type: e.target.value || null })} style={inputStyle}>
          <option value="">Setup</option>
          <option value="breakout">Breakout</option>
          <option value="pullback">Pullback</option>
          <option value="momentum">Momentum</option>
          <option value="vcp">VCP</option>
          <option value="reversal">Reversal</option>
        </select>
        <input type="number" placeholder="Entry" value={draft.entry ?? ""} onChange={(e) => patch({ entry: e.target.value ? Number(e.target.value) : null })} style={inputStyle} />
        <input type="number" placeholder="Stop" value={draft.stop ?? ""} onChange={(e) => patch({ stop: e.target.value ? Number(e.target.value) : null })} style={inputStyle} />
        <input type="number" placeholder="Target" value={draft.target ?? ""} onChange={(e) => patch({ target: e.target.value ? Number(e.target.value) : null })} style={inputStyle} />
        <input type="number" placeholder="Qty" value={draft.position_size ?? ""} onChange={(e) => patch({ position_size: e.target.value ? Number(e.target.value) : null })} style={inputStyle} />
      </div>
      <div className="decision-desk-secondary-grid" style={{ display: "grid", gridTemplateColumns: "90px 1fr 1fr 110px", gap: 8, marginTop: 8 }}>
        <input placeholder="TF" value={draft.timeframe ?? "D"} onChange={(e) => patch({ timeframe: e.target.value.toUpperCase() || "D" })} style={inputStyle} />
        <input placeholder="Thesis" value={draft.thesis ?? ""} onChange={(e) => patch({ thesis: e.target.value || null })} style={inputStyle} />
        <input placeholder="Invalidation rule" value={draft.invalidation_rule ?? ""} onChange={(e) => patch({ invalidation_rule: e.target.value || null })} style={inputStyle} />
        <select value={draft.confidence ?? ""} onChange={(e) => patch({ confidence: e.target.value ? Number(e.target.value) : null })} style={inputStyle}>
          <option value="">Quality</option>
          {[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score}/5</option>)}
        </select>
      </div>
      <textarea
        placeholder="Notes, tags, review later context..."
        value={draft.notes ?? ""}
        onChange={(e) => patch({ notes: e.target.value || null })}
        style={{ ...inputStyle, marginTop: 8, minHeight: 48, resize: "vertical" }}
      />
    </section>
  );
}

// ─── Chart + order panel ──────────────────────────────────────────────────────

function ChartPanel({
  symbol,
  latestClose,
  watchlistName,
  onOpenChart,
  onOpenChartDraw,
  onStepSymbol,
  plan,
  planValid,
  planNextAction,
}: {
  symbol: string;
  latestClose?: number | null;
  watchlistName?: string | null;
  onOpenChart: (symbol: string) => void;
  onOpenChartDraw: (symbol: string) => void;
  onStepSymbol: (direction: "prev" | "next") => void;
  plan: WorkflowState | null;
  planValid: boolean;
  planNextAction: string;
}) {
  const [candles, setCandles] = useState<CandleBar[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState(false);
  const [chartErrorMessage, setChartErrorMessage] = useState("");
  const [tf, setTf] = useState<WatchlistChartTimeframe>("3M");
  const [chartRequest, setChartRequest] = useState<WatchlistChartRequest>(() => getWatchlistChartRequest("3M"));
  const [chartSource, setChartSource] = useState<{ mode?: string | null; source?: string | null; asOf?: string | null; symbol?: string | null; range?: string | null } | null>(null);
  const [chartRangeNote, setChartRangeNote] = useState<string | null>(null);
  const [chartTimeframeMessage, setChartTimeframeMessage] = useState("");
  const [chartType, setChartType] = useState<ChartDisplayType>(() => readWatchlistChartType());
  const [showChartDetails, setShowChartDetails] = useState(false);
  const [showOrderTicket, setShowOrderTicket] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [setupType, setSetupType] = useState("breakout");
  const [tradeNote, setTradeNote] = useState("");
  const [orderBusy, setOrderBusy] = useState(false);
  const [orderMsg, setOrderMsg] = useState<{ ok: boolean; text: string; journalReady?: boolean } | null>(null);
  const [brokerStatus, setBrokerStatus] = useState<Awaited<ReturnType<typeof getBrokerStatus>> | null>(null);
  const [liveConfirmed, setLiveConfirmed] = useState(false);
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
  const planRiskReward = plan?.entry && plan?.stop && plan?.target && plan.entry > plan.stop && plan.target > plan.entry
    ? Math.abs(plan.target - plan.entry) / Math.abs(plan.entry - plan.stop)
    : null;
  const orderRiskAmount = (() => {
    const qtyN = parseInt(qty, 10);
    const priceN = parseFloat(price || String(referenceClose ?? ""));
    const stop = plan?.stop;
    if (!qtyN || !priceN || !stop) return null;
    return Math.abs(priceN - stop) * qtyN;
  })();
  const orderNudges = [
    ...(planValid ? [] : [planNextAction || "Complete the Decision Desk before order capture"]),
    ...(planRiskReward != null && planRiskReward < 2 ? ["R:R below 2.0; review risk before submitting"] : []),
    ...(chartRangeNote ? [chartRangeNote] : []),
    ...(brokerStatus?.plan_allows_broker === false ? ["Broker integration requires Pro or Elite"] : []),
    ...(brokerStatus?.token_expired ? ["Broker token expired; import/reconnect before syncing trades"] : []),
  ].slice(0, 3);
  const canRouteLiveOrder = Boolean(brokerStatus?.connected && brokerStatus?.live_order_enabled && brokerStatus?.plan_allows_broker);
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
  useEffect(() => {
    if (!showOrderTicket) return;
    getBrokerStatus().then(setBrokerStatus).catch(() => setBrokerStatus(null));
  }, [showOrderTicket]);
  useEffect(() => {
    window.localStorage.setItem(WATCHLIST_CHART_TYPE_STORAGE_KEY, chartType);
  }, [chartType]);
  const workspaceTimeframe = useMemo(() => {
    return getWatchlistChartRequest(tf).timeframe;
  }, [tf]);
  const chartWorkspace = useChartWorkspace(symbol, workspaceTimeframe);

  useEffect(() => {
    setChartLoading(true);
    setChartError(false);
    setChartErrorMessage("");
    setCandles([]);
    setChartSource(null);
    setChartRangeNote(null);
    setChartTimeframeMessage("");
    const request = getWatchlistChartRequest(tf);
    setChartRequest(request);
    getCandles(symbol, {
      limit: request.limit,
      timeframe: request.timeframe,
      from_date: request.from_date,
      to_date: request.to_date,
    })
      .then(d => {
        const responseSymbol = d.symbol?.toUpperCase?.() ?? symbol;
        if (responseSymbol !== symbol) {
          throw new Error(`Chart data returned ${responseSymbol} for ${symbol}`);
        }
        const rows = d.candles ?? [];
        setCandles(rows);
        setChartSource({
          mode: d.source_metadata?.mode ?? d.mode ?? (isMockMode ? "demo" : "eod"),
          source: formatMarketDataSource(d.source_metadata?.source_name ?? d.source, isMockMode ? "Demo data" : "Market data"),
          asOf: d.coverage?.as_of ?? d.source_metadata?.as_of ?? rows[rows.length - 1]?.time ?? null,
          symbol: responseSymbol,
          range: formatChartCoverageRange(d.coverage, rows),
        });
        setChartRangeNote(getCoverageAvailabilityMessage(d.coverage, request) ?? getRangeAvailabilityMessage(rows, request));
        if (d.latest?.close && !price) setPrice(String(d.latest.close));
      })
      .catch((error) => {
        setChartError(true);
        setChartErrorMessage(describeMarketDataError(error));
      })
      .finally(() => setChartLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tf]);

  useEffect(() => {
    if (latestClose) setPrice(String(latestClose));
  }, [latestClose]);

  useEffect(() => {
    if (!plan) return;
    if (plan.entry && plan.entry > 0) setPrice(String(plan.entry));
    if (plan.position_size && plan.position_size > 0) setQty(String(Math.trunc(plan.position_size)));
    if (plan.setup_type) setSetupType(plan.setup_type);

    if (plan.notes?.trim()) setTradeNote(plan.notes.trim());
  }, [
    plan,
    plan?.entry,
    plan?.position_size,
    plan?.setup_type,
    plan?.notes,
    plan?.thesis,
    plan?.invalidation_rule,
  ]);

  async function handleOrder() {
    const qtyN = parseInt(qty, 10);
    const priceN = parseFloat(price);
    if (!planValid) {
      setOrderMsg({ ok: false, text: planNextAction || "Complete the decision desk before drafting an order" });
      return;
    }
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
        ...(plan?.stop ? { stop_loss: plan.stop } : {}),
        ...(plan?.target ? { target_price: plan.target } : {}),
        ...(plan?.setup_type || setupType ? { setup_type: plan?.setup_type || setupType } : {}),
        ...(tradeNote.trim() ? { notes: tradeNote.trim() } : {}),
        ...(plan?.thesis?.trim() ? { thesis: plan.thesis.trim() } : {}),
        ...(plan?.invalidation_rule?.trim() ? { invalidation_rule: plan.invalidation_rule.trim() } : {}),
        ...(plan?.scanner_context ? { scanner_context: plan.scanner_context } : {}),
      };
      req.live_confirmed = canRouteLiveOrder && liveConfirmed;
      const result = await placeOrder(req);
      trackEvent(canRouteLiveOrder && liveConfirmed ? "broker_order_submitted" : "mock_order_drafted", { source: "watchlist", symbol, side, order_type: orderType, broker: result.broker });
      setOrderMsg({
        ok: true,
        text: canRouteLiveOrder && liveConfirmed
          ? `${side === "buy" ? "Buy" : "Sell"} order submitted via ${brokerStatus?.broker ?? "broker"} and journal draft created.`
          : `${side === "buy" ? "Buy" : "Sell"} plan saved as a journal capture draft.`,
        journalReady: true,
      });
      setLiveConfirmed(false);
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
      <div className="workspace-card-header watchlist-chart-header" style={{ background: "rgba(255,255,255,0.02)", paddingBottom: 8, flexShrink: 0 }}>
        <div className="watchlist-chart-title">
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span className="mono" style={{ fontSize: 16, fontWeight: 700 }}>{symbol}</span>
            <span className="caption">{referenceClose != null ? `Spot ${referenceClose.toFixed(2)}` : "Spot pending"}</span>
            {previewChange != null && (
              <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: previewChange >= 0 ? "var(--gain)" : "var(--loss)" }}>
                {previewChange >= 0 ? "+" : ""}{previewChange.toFixed(2)}%
              </span>
            )}
            <DataProvenanceBadge
              kind={isMockMode || chartSource?.mode === "demo" ? "demo" : chartSource?.mode === "fallback" ? "fallback" : "eod"}
              asOf={chartSource?.asOf ?? (latestBar?.time ? String(latestBar.time) : null)}
              compact
            />
            <span className="workspace-pill">Focus: {symbol}</span>
            <span className="workspace-pill" title={isMockMode ? "Demo workflow data, not market data" : "Using the latest available market snapshot unless a live quote is explicitly enabled"}>
              {chartSource?.source ?? (isMockMode ? "Demo data" : "Market data")}
            </span>
            <span className="caption">{chartRequest.label} · {formatChartGranularity(chartRequest.timeframe)} · {chartSource?.range ?? formatCandleRange(candles)}</span>
          </div>
          {chartSource && (
            <div className="caption" style={{ marginTop: 3 }}>
              {chartSource.symbol ?? symbol} candles · {chartSource.source ?? (isMockMode ? "Demo data" : "Market data")} · as of {chartSource.asOf ?? "latest available"} · {formatMarketDataMode(chartSource.mode, isMockMode)}
              {chartRangeNote ? ` · ${chartRangeNote}` : ""}
            </div>
          )}
        </div>
        <div className="watchlist-chart-controls">
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
            onClick={() => onOpenChartDraw(symbol)}
            className="workspace-chip-button"
            title="Open full chart drawing mode"
            style={{ width: 30, height: 30, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          >
            <PencilLine size={13} />
          </button>
          <button
            onClick={() => setShowChartDetails((current) => !current)}
            className={`workspace-chip-button${showChartDetails ? " active" : ""}`}
          >
            Analysis
          </button>
          <button
            onClick={() => setShowOrderTicket((current) => !current)}
            className={`workspace-chip-button${showOrderTicket ? " active" : ""}`}
          >
            Order
          </button>
          <IndicatorMenu selected={chartWorkspace.indicators} onChange={chartWorkspace.setIndicators} />
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
          <ChartTimeframeDropdown
            value={tf}
            onChange={setTf}
            onUnavailable={setChartTimeframeMessage}
          />
        </div>
      </div>

      {/* Chart */}
      {(chartRangeNote || chartTimeframeMessage) && (
        <div className="caption" style={{ padding: "8px 14px 0", color: "#fbbf24" }}>
          {chartTimeframeMessage || chartRangeNote}
        </div>
      )}
      {chartStats && (
        <div className="watchlist-chart-stats" style={{ padding: "10px 14px 2px", flexShrink: 0 }}>
          {[
            { label: "Structure", value: chartStats.trend, tone: chartStats.trend === "Uptrend" ? "var(--gain)" : chartStats.trend === "Downtrend" ? "var(--loss)" : "var(--text-secondary)" },
            { label: `${tf} move`, value: chartStats.change != null ? `${chartStats.change >= 0 ? "+" : ""}${chartStats.change.toFixed(2)}%` : "-", tone: (chartStats.change ?? 0) >= 0 ? "var(--gain)" : "var(--loss)" },
          ].map((item) => (
            <div key={item.label} style={{ minWidth: 0, padding: "7px 9px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="label" style={{ marginBottom: 3 }}>{item.label}</div>
              <div className="mono" style={{ fontSize: 12, fontWeight: 700, color: item.tone, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.value}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: "8px 14px 0" }}>
        {chartLoading ? (
          <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid var(--surface-3)", borderTopColor: "var(--accent)", animation: "spin 1s linear infinite" }}>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        ) : chartError || candles.length === 0 ? (
          <div style={{ textAlign: "center", maxWidth: 360, padding: "0 16px" }}>
            <div className="heading-card" style={{ fontSize: 13, marginBottom: 6 }}>Chart data unavailable</div>
            <div className="caption" style={{ lineHeight: 1.55 }}>
              {chartErrorMessage || "No chart data returned for this symbol and timeframe."}
            </div>
            <a className="workspace-chip-button" href="/data" style={{ marginTop: 10, display: "inline-flex", textDecoration: "none" }}>
              Data status
            </a>
          </div>
        ) : (
          <MiniChart candles={candles} height={chartHeight} dark={theme !== "light"} chartType={chartType} indicators={chartWorkspace.indicators} />
        )}
      </div>
      {showChartDetails && (
        <div style={{ padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
          <div className="watchlist-chart-details">
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
        <div className="order-ticket-header">
          <div>
            <div className="label" style={{ marginBottom: 4 }}>Quick order</div>
            <div className="caption">Journal capture only: save the plan to Journal. Place any real trade directly with your broker.</div>
          </div>
          {estimatedValue != null && (
            <div style={{ padding: "7px 10px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="label" style={{ marginBottom: 2 }}>Value</div>
              <div className="mono" style={{ fontSize: 12, fontWeight: 700 }}>₹{estimatedValue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</div>
            </div>
          )}
        </div>

        <div style={{ marginBottom: 10, padding: "8px 10px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: brokerStatus?.connected ? "var(--gain)" : "var(--text-secondary)" }}>
            {brokerStatus?.status_label ?? "Checking broker route..."}
          </span>
          <span className="caption">
            {brokerStatus?.connected ? "Broker import available; order capture still records as a journal draft" : "Order capture records as a journal draft"}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginBottom: 10 }}>
          {[
            { label: "R:R", value: planRiskReward != null ? planRiskReward.toFixed(2) : "—", tone: planRiskReward == null ? "var(--text-tertiary)" : planRiskReward >= 2 ? "var(--gain)" : "var(--warn)" },
            { label: "Risk", value: orderRiskAmount != null ? `₹${orderRiskAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "—", tone: "var(--text-secondary)" },
            { label: "Mode", value: brokerStatus?.connected ? "Import only" : "Simulated", tone: brokerStatus?.connected ? "var(--accent)" : "var(--text-tertiary)" },
          ].map((item) => (
            <div key={item.label} style={{ minWidth: 0, padding: "7px 9px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.025)" }}>
              <div className="label" style={{ marginBottom: 2 }}>{item.label}</div>
              <div className="mono" style={{ color: item.tone, fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.value}</div>
            </div>
          ))}
        </div>
        {orderNudges.length > 0 && (
          <div data-testid="order-safety-nudges" style={{ marginBottom: 10, padding: "8px 10px", borderRadius: 12, background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.22)" }}>
            <div className="label" style={{ marginBottom: 4 }}>Safety nudge</div>
            <div className="caption" style={{ color: "var(--warn)", lineHeight: 1.5 }}>{orderNudges.join(" · ")}</div>
          </div>
        )}

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

        {brokerStatus?.plan_allows_broker === false && (
          <div style={{ marginBottom: 8, padding: "8px 10px", borderRadius: 12, background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.22)" }}>
            <div className="caption" style={{ color: "var(--warn)", lineHeight: 1.5 }}>
              Broker integration requires Pro or Elite. Journal capture remains available for planning.
            </div>
            <button onClick={() => { window.location.href = "/settings/billing"; }} className="workspace-chip-button" style={{ marginTop: 8 }}>
              View Pro plan
            </button>
          </div>
        )}

        {canRouteLiveOrder && (
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 10, padding: "8px 10px", borderRadius: 12, background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.22)", color: "var(--text-secondary)", fontSize: 11, lineHeight: 1.5 }}>
            <input
              type="checkbox"
              checked={liveConfirmed}
              onChange={(event) => setLiveConfirmed(event.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>
              I confirm this is my own order decision and want AlphaVyuh to submit it to {brokerStatus?.broker ?? "the broker"}. I checked symbol, side, quantity, price, stop, target, and risk.
            </span>
          </label>
        )}

        <button onClick={handleOrder} disabled={orderBusy || !planValid || (canRouteLiveOrder && !liveConfirmed)}
          style={{
            width: "100%", padding: "10px 0", borderRadius: 12, border: "none",
            background: side === "buy" ? "var(--gain)" : "var(--loss)", color: "#fff",
            fontSize: 12, fontWeight: 700, cursor: orderBusy || !planValid ? "not-allowed" : "pointer",
            opacity: orderBusy || !planValid || (canRouteLiveOrder && !liveConfirmed) ? 0.5 : 1,
          }}>
          {orderBusy
            ? canRouteLiveOrder && liveConfirmed ? "Submitting..." : "Saving..."
            : planValid
              ? canRouteLiveOrder ? `${side === "buy" ? "Buy" : "Sell"} via ${brokerStatus?.broker ?? "broker"}` : `Save ${side === "buy" ? "buy" : "sell"} journal draft`
              : planNextAction}
        </button>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function WatchlistContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
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
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [queuePage, setQueuePage] = useState(0);
  const [workflowBySymbol, setWorkflowBySymbol] = useState<Record<string, WorkflowState>>({});
  const [fundamentalsBySymbol, setFundamentalsBySymbol] = useState<Record<string, { loading: boolean; data: Fundamentals | null; error: boolean }>>({});
  const appliedChartDrafts = useRef<Set<string>>(new Set());
  const pendingRouteSymbolRef = useRef<string | null>(null);

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
    const requestedWatchlistId = searchParams.get("id");
    const requestedSymbol = searchParams.get("symbol")?.toUpperCase() ?? null;
    if (!requestedSymbol) pendingRouteSymbolRef.current = null;
    const liteLists = await getWatchlists({ lite: true });
    setWatchlists(liteLists);
    if (liteLists.length > 0 && !activeId) {
      setActiveId(liteLists.some((list) => list.id === requestedWatchlistId) ? requestedWatchlistId : liteLists[0].id);
    }
    if (requestedSymbol) setChartSymbol(requestedSymbol);
    setLoading(false);

    getWatchlists({ force: true })
      .then((enrichedLists) => {
        setWatchlists(enrichedLists);
        if (enrichedLists.length > 0 && !activeId) {
          setActiveId(enrichedLists.some((list) => list.id === requestedWatchlistId) ? requestedWatchlistId : enrichedLists[0].id);
        }
        if (requestedSymbol) setChartSymbol(requestedSymbol);
      })
      .catch(() => {});
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

  useEffect(() => {
    const symbols = Array.from(new Set(watchlists.flatMap((watchlist) => watchlist.items.map((item) => item.symbol))));
    if (!symbols.length) return;
    getWorkflowStates({ symbols }).then((states) => {
      setWorkflowBySymbol((prev) => {
        const next = { ...prev };
        for (const state of states) next[state.symbol] = state;
        return next;
      });
    });
  }, [watchlists]);

  const symbolParam = searchParams.get("symbol");
  const watchlistIdParam = searchParams.get("id");
  const planDraftParam = searchParams.get("planDraft");
  useEffect(() => {
    if (!symbolParam) pendingRouteSymbolRef.current = null;
  }, [symbolParam]);

  useEffect(() => {
    if (!watchlistIdParam || watchlists.length === 0) return;
    const matched = watchlists.find((watchlist) => watchlist.id === watchlistIdParam);
    if (!matched) return;
    setActiveId(matched.id);
    const requestedSymbol = symbolParam?.toUpperCase() ?? null;
    const matchedRequestedSymbol = requestedSymbol && matched.items?.some((item) => item.symbol === requestedSymbol);
    if (requestedSymbol) {
      pendingRouteSymbolRef.current = requestedSymbol;
      setChartSymbol(requestedSymbol);
      trackEvent("watchlist_symbol_focused", { symbol: requestedSymbol, watchlist_id: matched.id, source: "route" });
    } else if (matched.items?.[0]?.symbol) {
      setChartSymbol(matched.items[0].symbol);
    }
    if (!requestedSymbol || matchedRequestedSymbol) {
      router.replace("/watchlist", { scroll: false });
    }
  }, [symbolParam, watchlistIdParam, watchlists, router]);

  useEffect(() => {
    if (!symbolParam || watchlists.length === 0) return;
    if (watchlistIdParam) return;
    let found = false;
    const requestedSymbol = symbolParam.toUpperCase();
    for (const wl of watchlists) {
      if (wl.items?.some((i: WatchlistItem) => i.symbol === requestedSymbol)) {
        setActiveId(wl.id);
        setChartSymbol(requestedSymbol);
        trackEvent("watchlist_symbol_focused", { symbol: requestedSymbol, watchlist_id: wl.id, source: "scanner_handoff" });
        found = true;
        break;
      }
    }
    if (!found && activeId) {
      addToWatchlist(activeId, requestedSymbol)
        .then(() => getQuote(requestedSymbol))
        .then(quote => {
          const newItem: WatchlistItem = quote
            ? { symbol: quote.symbol, sort_order: 0, added_at: new Date().toISOString(), company_name: quote.company_name, sector: quote.sector, close: quote.close, pct_change: quote.pct_change, volume_ratio: quote.volume_ratio, rsi_14: quote.rsi_14, pinned: false, tags: [], note: "" }
            : { symbol: requestedSymbol, sort_order: 0, added_at: new Date().toISOString(), pinned: false, tags: [], note: "" };
          setWatchlists(prev => prev.map(w => w.id === activeId ? { ...w, items: [...(w.items || []), newItem] } : w));
          setChartSymbol(requestedSymbol);
          trackEvent("watchlist_symbol_focused", { symbol: requestedSymbol, watchlist_id: activeId, source: "scanner_auto_add" });
        })
        .catch(() => {});
    }
    router.replace("/watchlist", { scroll: false });
  }, [symbolParam, watchlists.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof window === "undefined") return;
    const draftSymbol = symbolParam?.toUpperCase() ?? chartSymbol;
    if (planDraftParam !== "chart" || !draftSymbol) return;
    if (watchlistIdParam && watchlists.length === 0) return;
    const matchedRouteWatchlistId = watchlistIdParam && watchlists.some((watchlist) => watchlist.id === watchlistIdParam)
      ? watchlistIdParam
      : null;
    const targetWatchlistId = matchedRouteWatchlistId ?? activeId;
    const appliedKey = `${targetWatchlistId ?? "active"}:${draftSymbol}`;
    if (appliedChartDrafts.current.has(appliedKey)) return;
    const key = `alphavyuh-chart-plan-draft:${draftSymbol}`;
    const raw = window.localStorage.getItem(key);
    if (!raw) return;
    try {
      const draft = parseChartPlanDraft(raw, draftSymbol);
      if (!draft) {
        window.localStorage.removeItem(key);
        showToast("Could not load chart plan draft");
        return;
      }
      const patch = buildWorkflowPatchFromChartDraft(draft, targetWatchlistId);
      appliedChartDrafts.current.add(appliedKey);
      window.localStorage.removeItem(key);
      setWorkflowBySymbol((prev) => ({
        ...prev,
        [draftSymbol]: {
          ...(prev[draftSymbol] ?? { symbol: draftSymbol, lifecycle: "idea" as WorkflowLifecycle }),
          ...patch,
        },
      }));
      void upsertWorkflowState(patch);
      trackEvent("chart_plan_draft_applied", { symbol: draftSymbol, watchlist_id: targetWatchlistId, source: "full_chart_drawing", playbook_score: draft.playbookScore, risk_reward: draft.riskReward });
      showToast("Chart plan context loaded into Decision Desk");
    } catch {
      showToast("Could not load chart plan draft");
    }
  }, [activeId, chartSymbol, planDraftParam, symbolParam, watchlistIdParam, watchlists]);

  const activeWl = watchlists.find(w => w.id === activeId) ?? null;
  const chartHref = useCallback((symbol: string, draw?: "trendline") => {
    const params = new URLSearchParams({ from: "watchlist", full: "1" });
    if (draw) params.set("draw", draw);
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
  const selectedWorkflow = chartSymbol ? workflowBySymbol[chartSymbol] ?? null : null;
  const selectedPlanStatus = workflowPlanStatus(selectedWorkflow);
  const selectedFundamentals = chartSymbol ? fundamentalsBySymbol[chartSymbol] ?? null : null;
  const canReorder = deskFilter === "all" && !listQuery.trim() && queueView === "all" && activeTagFilter === "all" && sortMode === "manual";

  useEffect(() => {
    if (!chartSymbol || !visibleItems.length) return;
    const currentIndex = visibleItems.findIndex(item => item.symbol === chartSymbol);
    if (currentIndex < 0) return;
    const request = getWatchlistChartRequest("3M");
    const params = {
      limit: request.limit,
      timeframe: request.timeframe,
      from_date: request.from_date,
      to_date: request.to_date,
    };
    const adjacent = [
      visibleItems[currentIndex - 1]?.symbol,
      visibleItems[currentIndex + 1]?.symbol,
    ].filter(Boolean) as string[];
    const timer = window.setTimeout(() => {
      adjacent.forEach((nextSymbol) => prefetchCandles(nextSymbol, params));
    }, 150);
    return () => window.clearTimeout(timer);
  }, [chartSymbol, visibleItems]);

  useEffect(() => {
    if (!liveQuotePollingEnabled) return;
    if (!activeId || !pageItems.length) return;
    let cancelled = false;

    async function refreshLiveQuotes() {
      const updates = await Promise.all(
        pageItems.map(async (item) => {
          const live = await getQuoteLive(item.symbol).catch(() => null);
          return live ? {
            symbol: item.symbol,
            close: live.close ?? undefined,
            pct_change: live.pct_change ?? undefined,
          } : null;
        })
      );

      if (cancelled) return;
      const liveMap = new Map(updates.filter(Boolean).map((u) => [u!.symbol, u!]));
      setWatchlists(prev => prev.map(w => (
        w.id !== activeId
          ? w
          : {
              ...w,
              items: w.items.map(item => {
                const live = liveMap.get(item.symbol);
                return live ? { ...item, close: live.close, pct_change: live.pct_change } : item;
              }),
            }
      )));
    }

    refreshLiveQuotes();
    const id = window.setInterval(refreshLiveQuotes, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  // We intentionally refresh only the visible five-symbol queue page.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, pageSymbolsKey]);

  useEffect(() => {
    if (symbolParam || !visibleItems.length) return;
    const selectedIsVisible = chartSymbol && visibleItems.some(item => item.symbol === chartSymbol);
    if (!selectedIsVisible) setChartSymbol(visibleItems[0].symbol);
  }, [chartSymbol, symbolParam, visibleItems]);

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
    if (hasSelectedSymbol && pendingRouteSymbolRef.current === chartSymbol) {
      pendingRouteSymbolRef.current = null;
    }
    if (!hasSelectedSymbol && (symbolParam?.toUpperCase() === chartSymbol || pendingRouteSymbolRef.current === chartSymbol)) {
      return;
    }
    if (!hasSelectedSymbol) {
      setChartSymbol(visibleItems[0].symbol);
    }
  }, [activeId, chartSymbol, symbolParam, visibleItems]);

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

  async function addStarterSymbols() {
    if (!activeId) return;
    setAdding(true);
    setAddMsg("");
    try {
      const existing = new Set((activeWl?.items ?? []).map((item) => item.symbol));
      const symbols = STARTER_SYMBOLS.filter((symbol) => !existing.has(symbol));
      const newItems = await Promise.all(symbols.map(async (symbol, index): Promise<WatchlistItem> => {
        await addToWatchlist(activeId, symbol).catch(() => {});
        const quote = await getQuote(symbol).catch(() => null);
        return quote
          ? { symbol: quote.symbol, sort_order: index, added_at: new Date().toISOString(), company_name: quote.company_name, sector: quote.sector, close: quote.close, pct_change: quote.pct_change, volume_ratio: quote.volume_ratio, rsi_14: quote.rsi_14, pinned: false, tags: [], note: "" }
          : { symbol, sort_order: index, added_at: new Date().toISOString(), pinned: false, tags: [], note: "" }
      }));
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

  useEffect(() => {
    if (!showSelectedMeta || !selectedItem) return;
    const symbol = selectedItem.symbol;
    const existing = fundamentalsBySymbol[symbol];
    if (existing?.loading || existing?.data || existing?.error) return;

    let cancelled = false;
    setFundamentalsBySymbol((prev) => ({ ...prev, [symbol]: { loading: true, data: null, error: false } }));
    getFundamentals(symbol)
      .then((data) => {
        if (cancelled) return;
        setFundamentalsBySymbol((prev) => ({ ...prev, [symbol]: { loading: false, data, error: !data } }));
      })
      .catch(() => {
        if (cancelled) return;
        setFundamentalsBySymbol((prev) => ({ ...prev, [symbol]: { loading: false, data: null, error: true } }));
      });
    return () => {
      cancelled = true;
    };
  }, [fundamentalsBySymbol, selectedItem, showSelectedMeta]);

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

  return (
    <div className="workspace-page" style={{ gap: 10, minHeight: "calc(100vh - 104px)" }}>
      <div className="workspace-grid" style={{ gridTemplateColumns: sidebarCollapsed ? '48px 360px minmax(0, 1fr)' : '252px 360px minmax(0, 1fr)', minHeight: "calc(100vh - 104px)" }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 88, left: "50%", transform: "translateX(-50%)", zIndex: 50, fontSize: 13, padding: "10px 16px", borderRadius: 16, boxShadow: "var(--shadow-panel)", background: "linear-gradient(180deg, rgba(20,29,33,0.96), rgba(13,20,24,0.96))", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" }}>
          {toast}
        </div>
      )}

      {/* ── Watchlist tabs sidebar ─── */}
      {sidebarCollapsed ? (
        <div className="workspace-card workspace-card-muted" style={{ width: 46, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 14, gap: 10 }}>
          <button onClick={() => setSidebarCollapsed(false)} style={{ color: "var(--text-tertiary)" }}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
              <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div style={{ display: "grid", gap: 8 }}>
            {watchlists.slice(0, 8).map((wl) => (
              <button
                key={wl.id}
                onClick={() => {
                  setActiveId(wl.id);
                  setSidebarCollapsed(false);
                }}
                title={wl.name}
                style={{ lineHeight: 0 }}
              >
                <WatchlistAvatar name={wl.name} active={activeId === wl.id} size={28} />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <aside className="workspace-card workspace-card-muted" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <div className="workspace-card-header" style={{ padding: "14px 14px" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Watchlists</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button onClick={() => setShowNewWl(o => !o)} style={{ color: "var(--accent)", lineHeight: 0 }}>
                <Plus size={15} />
              </button>
              <button onClick={() => setSidebarCollapsed(true)} style={{ color: "var(--text-tertiary)", lineHeight: 0 }}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
                  <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>

          {showNewWl && (
            <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border-subtle)", display: "flex", gap: 6 }}>
              <input
                autoFocus
                value={newWlName}
                onChange={e => setNewWlName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreateWatchlist()}
                placeholder="List name…"
                style={{ flex: 1, fontSize: 11, borderRadius: "var(--radius-sm)", padding: "4px 8px", background: "var(--surface-3)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", outline: "none" }}
              />
              <button onClick={handleCreateWatchlist} style={{ fontSize: 11, fontWeight: 500, color: "var(--accent)" }}>Add</button>
              <button onClick={() => setShowNewWl(false)} style={{ color: "var(--text-tertiary)", lineHeight: 0 }}><X size={12} /></button>
            </div>
          )}

          <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
            {loading ? (
              <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                {[1,2,3].map(i => <div key={i} style={{ height: 32, borderRadius: "var(--radius-sm)", background: "var(--surface-3)" }} />)}
              </div>
            ) : watchlists.length === 0 ? (
              <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.7 }}>
                No watchlists yet.
                <div style={{ marginTop: 6 }}>Create one here or send names in from the scanner to start the workflow.</div>
              </div>
            ) : (
              watchlists.map(wl => {
                const active = activeId === wl.id;
                return (
                  <div key={wl.id} style={{ position: "relative", display: "flex", alignItems: "center" }} className="wl-item">
                    <button onClick={() => setActiveId(wl.id)}
                      style={{
                        flex: 1, textAlign: "left", padding: "8px 14px", fontSize: 13, cursor: "pointer",
                        background: active ? "var(--accent-subtle)" : "transparent",
                        color: active ? "var(--accent)" : "var(--text-secondary)",
                        fontWeight: active ? 500 : 400,
                        transition: "all var(--motion-instant) var(--ease-out)",
                      }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0, paddingRight: 20 }}>
                        <WatchlistAvatar name={wl.name} active={active} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wl.name}</div>
                          <div style={{ fontSize: 10, marginTop: 2, color: "var(--text-tertiary)" }}>{wl.items.length} stocks</div>
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={() => handleDeleteWatchlist(wl.id)}
                      style={{ position: "absolute", right: 8, color: "var(--text-tertiary)", lineHeight: 0, opacity: 0 }}
                      className="wl-delete"
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--loss)"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      )}

      {/* ── Stock list ─────────────────────────────────────── */}
      <div className="workspace-card workspace-card-muted" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div className="workspace-card-header" style={{ paddingBottom: 10, flexShrink: 0 }}>
          <div>
            <div className="workspace-card-title" style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <WatchlistAvatar name={activeWl?.name ?? "Watchlist"} active={Boolean(activeWl)} size={30} />
              <span>{activeWl ? activeWl.name : "Watchlist"}</span>
            </div>
            {activeWl && (
              <div className="caption">{activeWl.items.length} stock{activeWl.items.length !== 1 ? "s" : ""}</div>
            )}
          </div>

          {activeWl && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
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
                style={{ padding: "5px 8px", borderRadius: "var(--radius-sm)", fontSize: 11, fontWeight: 700, background: "linear-gradient(180deg, var(--accent-strong), var(--accent))", color: "#04120d", border: "1px solid rgba(244,247,251,0.24)", cursor: "pointer", opacity: (adding || !symbolInput.trim()) ? 0.5 : 1 }}>
                {adding ? "…" : "Add"}
              </button>
            </div>
          )}
        </div>

        <div style={{ padding: "0 18px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
          {selectedItem ? (
            <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.025)", padding: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{selectedItem.symbol}</div>
                    <Num style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {selectedItem.close != null ? `₹${selectedItem.close.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "-"}
                    </Num>
                    <Num style={{ fontSize: 12, fontWeight: 700, color: (selectedItem.pct_change ?? 0) >= 0 ? "var(--gain)" : "var(--loss)" }}>
                      {selectedItem.pct_change != null ? `${selectedItem.pct_change >= 0 ? "+" : ""}${selectedItem.pct_change.toFixed(2)}%` : "-"}
                    </Num>
                    {selectedSetup && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                          color: setupToneColor(selectedSetup.tone),
                          padding: "2px 7px",
                          borderRadius: 999,
                          background: "rgba(255,255,255,0.04)",
                          border: `1px solid ${setupToneColor(selectedSetup.tone)}`,
                        }}
                      >
                        {selectedSetup.label}
                      </span>
                    )}
                  </div>
                  <div className="caption" style={{ marginTop: 2, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {selectedItem.company_name || selectedItem.sector || "Active watchlist symbol"}
                  </div>
                </div>
                <div className="workspace-pill-row" style={{ marginTop: 0 }}>
                  <button className="workspace-chip-button" onClick={() => router.push(chartHref(selectedItem.symbol))}>
                    Open chart
                  </button>
                  <button className="workspace-chip-button" onClick={() => router.push(`/journal?symbol=${selectedItem.symbol}`)}>
                    Review journal
                  </button>
                  <button className={`workspace-chip-button${showSelectedMeta ? " active" : ""}`} onClick={() => setShowSelectedMeta((current) => !current)}>
                    {showSelectedMeta ? "Hide details" : "Details"}
                  </button>
                </div>
              </div>
              {showSelectedMeta && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, marginTop: 10 }}>
                    {selectedMetrics.map((metric) => (
                      <div key={metric.label} style={{ padding: "8px 10px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                        <div className="label" style={{ marginBottom: 3 }}>{metric.label}</div>
                        <div className="mono" style={{ fontSize: 12, fontWeight: 600, color: metric.tone }}>{metric.value}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                      <div className="label">Fundamentals</div>
                      <div className="caption">
                        {selectedFundamentals?.loading
                          ? "Loading"
                          : selectedFundamentals?.data
                            ? "Cached"
                            : selectedFundamentals?.error
                              ? "Unavailable"
                              : "Queued"}
                      </div>
                    </div>
                    {selectedFundamentals?.loading || !selectedFundamentals ? (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                        {[1, 2, 3, 4].map((item) => (
                          <div key={item} style={{ height: 38, borderRadius: 10, background: "linear-gradient(90deg, rgba(255,255,255,0.035), rgba(255,255,255,0.06), rgba(255,255,255,0.035))" }} />
                        ))}
                      </div>
                    ) : selectedFundamentals.data ? (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                        {[
                          ["Mkt cap", selectedFundamentals.data.market_cap_str ?? "-"],
                          ["P/E", selectedFundamentals.data.trailing_pe != null ? selectedFundamentals.data.trailing_pe.toFixed(1) : "-"],
                          ["ROE", selectedFundamentals.data.return_on_equity != null ? `${selectedFundamentals.data.return_on_equity.toFixed(1)}%` : "-"],
                          ["Sales", selectedFundamentals.data.revenue_growth != null ? `${selectedFundamentals.data.revenue_growth >= 0 ? "+" : ""}${selectedFundamentals.data.revenue_growth.toFixed(1)}%` : "-"],
                        ].map(([label, value]) => (
                          <div key={label} style={{ minWidth: 0, padding: "7px 9px", borderRadius: 10, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
                            <div className="label" style={{ marginBottom: 3 }}>{label}</div>
                            <div className="mono" style={{ fontSize: 12, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="caption" style={{ lineHeight: 1.6 }}>
                        Fundamentals are not available right now. The desk keeps chart, queue, and plan workflow usable while this data source recovers.
                      </div>
                    )}
                  </div>
                  {selectedReviewState && (
                    <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className="label" style={{ marginBottom: 6 }}>Review context</div>
                      <div className="caption" style={{ lineHeight: 1.65 }}>
                        {selectedReviewState.state === "reviewed"
                          ? `Reviewed ${selectedReviewState.reviewed}/${selectedReviewState.closed} closed trades on ${selectedItem.symbol}.`
                          : selectedReviewState.state === "needs-review"
                            ? `${selectedReviewState.closed} closed trades on ${selectedItem.symbol} still need review coverage.`
                            : `No closed review history yet on ${selectedItem.symbol}.`}
                        {selectedReviewState.lastSetup ? ` Last setup: ${selectedReviewState.lastSetup}.` : ""}
                      </div>
                      {selectedReviewState.latestLesson && (
                        <div className="caption" style={{ marginTop: 8, color: "var(--text-secondary)" }}>
                          Latest lesson: {selectedReviewState.latestLesson.slice(0, 120)}{selectedReviewState.latestLesson.length > 120 ? "..." : ""}
                        </div>
                      )}
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 10, marginTop: 10 }}>
                    <div style={{ padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className="label" style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                        <Tag size={11} /> Queue tags
                      </div>
                      <div className="workspace-pill-row" style={{ marginBottom: 8 }}>
                        {(selectedItemMeta.tags ?? []).length > 0 ? (
                          (selectedItemMeta.tags ?? []).map((tag) => (
                            <button
                              key={tag}
                              className="workspace-pill"
                              onClick={() => removeTagFromSelected(tag)}
                              style={{ cursor: "pointer" }}
                              title="Remove tag"
                            >
                              #{tag} ×
                            </button>
                          ))
                        ) : (
                          <span className="caption">No tags yet</span>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && addTagToSelected()}
                          placeholder="Add tag…"
                          style={{ flex: 1, fontSize: 12, borderRadius: 999, padding: "7px 10px", background: "var(--surface-3)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
                        />
                        <button className="workspace-chip-button active" onClick={addTagToSelected}>Add</button>
                      </div>
                    </div>
                    <div style={{ padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className="label" style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                        {selectedItemMeta.pinned ? <Pin size={11} /> : <PinOff size={11} />} Queue priority
                      </div>
                      <button
                        className={`workspace-chip-button${selectedItemMeta.pinned ? " active" : ""}`}
                        onClick={() => updateItemMeta(selectedItem.symbol, { pinned: !selectedItemMeta.pinned })}
                        style={{ marginBottom: 8 }}
                      >
                        {selectedItemMeta.pinned ? "Pinned to top" : "Pin to top"}
                      </button>
                      <div className="caption" style={{ lineHeight: 1.6 }}>
                        {selectedItemMeta.pinned
                          ? "This symbol stays at the top of the active queue while filters are applied."
                          : "Pin high-conviction names so they stay visible at the top of the queue."}
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className="label" style={{ marginBottom: 6 }}>Watchlist note</div>
                    <textarea
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value.slice(0, 280))}
                      onBlur={() => void saveSelectedNote()}
                      placeholder="Why is this still in the queue? What needs to happen before you act?"
                      style={{ width: "100%", minHeight: 68, resize: "vertical", fontSize: 12, borderRadius: 10, padding: "8px 10px", background: "var(--surface-3)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
                    />
                  </div>
                </>
              )}
            </div>
          ) : (
            <div style={{ borderRadius: 16, border: "1px dashed rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.02)", padding: 12 }}>
              <div className="caption" style={{ lineHeight: 1.6 }}>
                Select a symbol to load its working panel.
              </div>
            </div>
          )}
        </div>

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
            <div className="workspace-pill-row">
              {(queueView !== "all" || deskFilter !== "all" || activeTagFilter !== "all" || sortMode !== "manual" || listQuery.trim()) && (
                <button className="workspace-chip-button" onClick={resetDeskView}>
                  Reset
                </button>
              )}
              <button className={`workspace-chip-button${showDeskControls ? " active" : ""}`} onClick={() => setShowDeskControls((current) => !current)}>
                {showDeskControls ? "Hide controls" : "Desk controls"}
              </button>
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
                ? <>Showing <Num>{pageStart + 1}</Num>-<Num>{Math.min(pageStart + WATCHLIST_PAGE_SIZE, visibleItems.length)}</Num> of <Num>{visibleItems.length}</Num>. Arrow keys move through the full queue.</>
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

      {/* ── Chart + order panel ─────────────────────────────── */}
      <div className="workspace-card" style={{ minWidth: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {chartSymbol ? (
          <>
            <div style={{ flex: 1, minHeight: 0 }}>
              <ChartPanel key={chartSymbol} symbol={chartSymbol}
                latestClose={visibleItems.find(i => i.symbol === chartSymbol)?.close ?? activeWl?.items.find(i => i.symbol === chartSymbol)?.close}
                watchlistName={activeWl?.name ?? null}
                onOpenChart={(sym) => router.push(chartHref(sym))}
                onOpenChartDraw={(sym) => router.push(chartHref(sym, "trendline"))}
                onStepSymbol={moveSelection}
                plan={selectedWorkflow}
                planValid={selectedPlanStatus.valid}
                planNextAction={selectedPlanStatus.next} />
            </div>
            <DecisionDesk
              symbol={chartSymbol}
              watchlistId={activeWl?.id ?? null}
              plan={selectedWorkflow}
              onPlanChange={(next) => setWorkflowBySymbol((prev) => ({ ...prev, [next.symbol]: next }))}
              onToast={showToast}
            />
          </>
        ) : (
          <div style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <EmptyState
              title="Click any stock to load its chart"
              description="Use the watchlist as your analysis desk. Select a symbol, then open the full chart for price, volume, and indicator context."
            />
          </div>
        )}
      </div>

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
