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
import { PencilLine, Plus, Trash2, GripVertical, X, Search, Pin, PinOff, Tag, List, Eye, Filter, Settings } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { displayCompanyName } from "@/lib/company-display";
import {
  WATCHLIST_QUEUE_STEPS,
  bumpKeyboardHintSession,
  getItemSignals,
  readDecisionDeskExpandedMap,
  readKeyboardHintSessions,
  resolveWatchlistQueueStep,
  signalToneColor,
  writeDecisionDeskExpandedMap,
} from "@/lib/watchlist-ux";
import { decisionJournalHref } from "@/lib/decision-record";
import type { Watchlist, WatchlistItem, CandleBar, JournalEntry, Fundamentals, ScanResult } from "@/lib/api";
import {
  getWatchlists,
  getJournalEntries,
  createWatchlist,
  deleteWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  reorderWatchlist,
  updateWatchlistItemMetadata,
  getQuotes,
  searchSymbols,
  getCandles,
  prefetchCandles,
  placeOrder,
  getFundamentals,
  getBrokerStatus,
  getWorkflowStates,
  getSetupReview,
  isMockMode,
  liveQuotePollingEnabled,
  createSetup,
  reviewSetup,
  updateSetup,
  type PlaceOrderRequest,
  type Setup,
  type SetupReview,
  type WatchlistItemMetadataUpdate,
  type WorkflowLifecycle,
  type WorkflowState,
  type UpdateSetupRequest,
  upsertWorkflowState,
} from "@/lib/api";
import type { SymbolSearchResult } from "@/lib/api";
import { DataProvenanceBadge, EmptyState, Num } from "@/components/ui";
import IndicatorMenu from "@/components/charts/IndicatorMenu";
import ChartTimeframeDropdown from "@/components/charts/ChartTimeframeDropdown";
import { useChartWorkspace } from "@/components/charts/hooks/useChartWorkspace";
import { workflowLifecycleFlags, workflowPlanStatus } from "@/lib/workflow";
import { trackEvent } from "@/lib/analytics";
import { toast as sonnerToast } from "@/lib/toast";
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
import { formatMarketDataSource } from "@/lib/data-copy";
import { describeMarketDataError } from "@/lib/data-errors";
import { decisionRecordRows, decisionLifecycleLabel, type DecisionRecordReviewState } from "@/lib/decision-record";
import { buildWorkflowPatchFromChartDraft, parseChartPlanDraft } from "@/lib/chart-plan-handoff";
import { accountDataErrorMessage } from "@/lib/account-data-status";
import { WorkflowDeskHeader } from "@/components/WorkflowDeskHeader";
import { useOrderIntentKey } from "@/lib/order-intent";

type ChartDisplayType = "candles" | "bars" | "line";
type SetupSignal = { label: string; tone: "gain" | "loss" | "accent" | "neutral"; score: number };

const MiniChart = dynamic(() => import("@/components/charts/MiniChart"), { ssr: false });
const STARTER_SYMBOLS = ["RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK", "TATAMOTORS"];
const WATCHLIST_PAGE_SIZE = 5;
const WATCHLIST_CHART_TYPE_STORAGE_KEY = "alphavyuh-watchlist-chart-type";
const WATCHLIST_DATA_UNAVAILABLE_MESSAGE = "Watchlist data is temporarily unavailable. Check Data Status before editing lists.";
const WATCHLIST_RECOVERY_MESSAGE = "Check Watchlist or Data Status, then try again.";
const WATCHLIST_LOCAL_META_MESSAGE = "Watchlist note was saved locally. Sync will retry when Watchlist is available.";
const WATCHLIST_CREATE_FAILED_MESSAGE = `Watchlist could not be created. ${WATCHLIST_RECOVERY_MESSAGE}`;
const WATCHLIST_DELETE_FAILED_MESSAGE = `Watchlist could not be deleted. ${WATCHLIST_RECOVERY_MESSAGE}`;
const WATCHLIST_STARTER_FAILED_MESSAGE = `Starter queue could not be completed. ${WATCHLIST_RECOVERY_MESSAGE}`;
const WATCHLIST_REORDER_FAILED_MESSAGE = `Watchlist order could not be saved. ${WATCHLIST_RECOVERY_MESSAGE}`;
const SYMBOL_SEARCH_FAILED_MESSAGE = "Symbol search is temporarily unavailable. Check Data Status, then try again.";

function watchlistAddFailedMessage(symbol: string): string {
  return `${symbol.toUpperCase()} could not be added. ${WATCHLIST_RECOVERY_MESSAGE}`;
}

function watchlistAlreadyContainsMessage(symbol: string): string {
  return `${symbol.toUpperCase()} is already in this watchlist.`;
}

function watchlistAddMessage(symbol: string, error?: unknown): string {
  if (error instanceof Error && /already in watchlist/i.test(error.message)) {
    return watchlistAlreadyContainsMessage(symbol);
  }
  return watchlistAddFailedMessage(symbol);
}

function watchlistRemoveFailedMessage(symbol: string): string {
  return `${symbol.toUpperCase()} could not be removed. ${WATCHLIST_RECOVERY_MESSAGE}`;
}

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

function formatCompactVolume(value: number): string {
  if (value >= 10_000_000) return `${(value / 10_000_000).toFixed(1)}Cr`;
  if (value >= 100_000) return `${(value / 100_000).toFixed(1)}L`;
  return value.toLocaleString("en-IN");
}

function formatNullablePrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function watchlistItemFromQuote(quote: ScanResult, sortOrder = 0): WatchlistItem {
  return {
    symbol: quote.symbol,
    sort_order: sortOrder,
    added_at: new Date().toISOString(),
    company_name: quote.company_name,
    sector: quote.sector,
    close: quote.close,
    pct_change: quote.pct_change,
    volume_ratio: quote.volume_ratio,
    rsi_14: quote.rsi_14,
    pinned: false,
    tags: [],
    note: "",
  };
}

function watchlistItemFromSymbol(symbol: string, sortOrder = 0): WatchlistItem {
  return {
    symbol: symbol.toUpperCase(),
    sort_order: sortOrder,
    added_at: new Date().toISOString(),
    pinned: false,
    tags: [],
    note: "",
  };
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

function WatchlistSignalPills({ item, dense }: { item: WatchlistItem; dense?: boolean }) {
  const signals = getItemSignals(item);
  const primary = signals[0];
  const extra = signals.length - 1;
  if (!primary) return null;
  const color = signalToneColor(primary.tone);

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
      <span
        title={primary.tooltip}
        className="watchlist-signal-pill"
        style={{
          fontSize: dense ? 9 : 10,
          fontWeight: 700,
          letterSpacing: "0.03em",
          color: color,
          padding: dense ? "2px 7px" : "3px 8px",
          borderRadius: 999,
          background: primary.tone === "gain" ? "rgba(45,181,116,0.1)" : "rgba(217,119,6,0.1)",
          border: `1px solid ${color}`,
          maxWidth: dense ? 110 : 140,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {primary.label}
      </span>
      {extra > 0 && (
        <span
          title={signals.slice(1).map((signal) => signal.label).join(" · ")}
          className="watchlist-signal-pill"
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: "var(--warn)",
            padding: "2px 6px",
            borderRadius: 999,
            background: "rgba(217,119,6,0.08)",
            border: "1px solid rgba(217,119,6,0.35)",
          }}
        >
          +{extra} more
        </span>
      )}
    </span>
  );
}

function WatchlistWorkflowStrip({
  activeStep,
  hasItems,
  adding,
  onAddStarter,
  onOpenScanner,
}: {
  activeStep: number;
  hasItems: boolean;
  adding: boolean;
  onAddStarter: () => void;
  onOpenScanner: () => void;
}) {
  return (
    <div
      data-testid="watchlist-workflow-strip"
      className="watchlist-workflow-strip"
      style={{
        padding: "10px 18px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gap: 12,
        alignItems: "center",
        flexShrink: 0,
        background: "rgba(255,255,255,0.018)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div className="label" style={{ marginBottom: 7 }}>Queue workflow</div>
        <div className="watchlist-workflow-steps">
          {WATCHLIST_QUEUE_STEPS.map((step, index) => {
            const isActive = index === activeStep;
            const isComplete = index < activeStep;
            return (
              <div
                key={step.key}
                title={step.tooltip}
                className={`watchlist-workflow-step${isActive ? " active" : ""}${isComplete ? " complete" : ""}`}
                data-testid={`watchlist-workflow-step-${step.key}`}
              >
                <span className="watchlist-workflow-step-index mono">{index + 1}</span>
                <span className="watchlist-workflow-step-label">{step.label}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
        {!hasItems && (
          <button className="workspace-chip-button active" onClick={onAddStarter} disabled={adding} style={{ opacity: adding ? 0.55 : 1 }}>
            {adding ? "Adding..." : "Add starter queue"}
          </button>
        )}
        <button className="workspace-chip-button" onClick={onOpenScanner}>
          Run scanner
        </button>
      </div>
    </div>
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
  onPrefetchChart,
  onDraftOrder,
  dense,
}: {
  item: WatchlistItem;
  isSelected: boolean;
  pinned: boolean;
  reviewState?: "reviewed" | "needs-review" | "new";
  onRemove: (symbol: string) => void;
  onSelect: (symbol: string) => void;
  onOpenChart: (symbol: string) => void;
  onPrefetchChart: (symbol: string) => void;
  onDraftOrder: (symbol: string) => void;
  dense: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.symbol });
  const priceTone = (item.pct_change ?? 0) >= 0 ? "var(--gain)" : "var(--loss)";
  const companyLabel = displayCompanyName(item.symbol, item.company_name);

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
      onMouseEnter={() => onPrefetchChart(item.symbol)}
      onFocus={() => onPrefetchChart(item.symbol)}
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
          <WatchlistSignalPills item={item} dense={dense} />
        </div>
        {companyLabel && (
          <div className="caption" style={{ maxWidth: dense ? 160 : 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: dense ? 0 : 2, fontSize: dense ? 10 : 11 }}>
            {companyLabel}
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
      <td style={{ padding: dense ? "5px 6px 5px 4px" : "7px 8px 7px 4px", textAlign: "right", width: 138 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 6, minWidth: 128 }}>
          <button
            type="button"
            onClick={() => onOpenChart(item.symbol)}
            aria-label={`Open chart for ${item.symbol}`}
            title={`Open chart for ${item.symbol}`}
            className="workspace-chip-button"
            style={{ minWidth: 44, height: 24, padding: "0 8px", fontSize: 10, lineHeight: 1 }}
          >
            Chart
          </button>
          <button
            type="button"
            onClick={() => onDraftOrder(item.symbol)}
            aria-label={`Draft order for ${item.symbol}`}
            title={`Draft order for ${item.symbol}`}
            className="workspace-chip-button"
            style={{ minWidth: 48, height: 24, padding: "0 8px", fontSize: 10, lineHeight: 1 }}
          >
            Draft
          </button>
          <button
            onClick={() => onRemove(item.symbol)}
            aria-label={`Remove ${item.symbol} from watchlist`}
            title={`Remove ${item.symbol} from watchlist`}
            data-testid={`watchlist-remove-${item.symbol}`}
            style={{ color: "var(--text-tertiary)", lineHeight: 0, opacity: 0 }}
            className="remove-btn"
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--loss)"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </td>
    </tr>
  );
}

const LIFECYCLES: WorkflowLifecycle[] = ["watch", "ready", "review_later", "ignored", "reviewed", "idea", "triggered", "open", "closed", "invalidated"];

function lifecycleLabel(value: WorkflowLifecycle) {
  return decisionLifecycleLabel({ lifecycle: value });
}

function workflowSetupDirection(draft: WorkflowState): "long" | "short" {
  return draft.tags?.includes("short") ? "short" : "long";
}

function setupReviewInput(draft: WorkflowState): Partial<Setup> {
  const direction = workflowSetupDirection(draft);
  const entry = draft.entry ?? null;
  const stop = draft.stop ?? null;
  const quantity = draft.position_size ?? null;
  const riskPerShare = entry != null && stop != null
    ? direction === "short" ? stop - entry : entry - stop
    : null;
  return {
    id: draft.setup_id ?? undefined,
    symbol: draft.symbol,
    direction,
    status: "planned",
    strategy_tag: draft.setup_type ?? null,
    entry_low: entry,
    entry_high: entry,
    stop_price: stop,
    target_price: draft.target ?? null,
    planned_quantity: quantity,
    planned_risk_amount: riskPerShare != null && quantity != null ? riskPerShare * quantity : null,
    thesis: draft.thesis ?? null,
    invalidation_reason: draft.invalidation_rule ?? null,
    source: "watchlist",
    source_scanner_candidate_id: draft.scanner_context?.candidate_id ?? null,
    scanner_context: draft.scanner_context ?? null,
  };
}

function setupUpdatePayload(draft: WorkflowState): UpdateSetupRequest {
  const input = setupReviewInput(draft);
  return {
    direction: input.direction,
    status: "planned",
    strategy_tag: input.strategy_tag,
    entry_low: input.entry_low,
    entry_high: input.entry_high,
    stop_price: input.stop_price,
    target_price: input.target_price,
    planned_quantity: input.planned_quantity,
    thesis: input.thesis,
    invalidation_reason: input.invalidation_reason,
    source: input.source,
    source_scanner_candidate_id: input.source_scanner_candidate_id,
    scanner_context: input.scanner_context,
  };
}

function DecisionDesk({
  symbol,
  watchlistId,
  plan,
  item,
  reviewState,
  setupReview,
  expanded,
  onExpandedChange,
  onPlanChange,
  onSetupReviewChange,
  onToast,
  onDraftOrder,
}: {
  symbol: string;
  watchlistId: string | null;
  plan: WorkflowState | null;
  item: WatchlistItem | null;
  reviewState: DecisionRecordReviewState;
  setupReview: SetupReview | null;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onPlanChange: (plan: WorkflowState) => void;
  onSetupReviewChange: (symbol: string, review: SetupReview | null) => void;
  onToast: (msg: string) => void;
  onDraftOrder: (symbol: string) => void;
}) {
  const status = workflowPlanStatus(plan);
  const draft = plan ?? { symbol, watchlist_id: watchlistId, source: "watchlist", lifecycle: "watch", timeframe: "D", tags: [] };
  const journalHref = decisionJournalHref(draft as WorkflowState);
  const hasTradePlan = Boolean(draft.entry && draft.stop && draft.target);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const direction = workflowSetupDirection(draft as WorkflowState);
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
    ...(riskRewardValue != null && riskRewardValue < 2 ? ["R:R is below 2.0; record why this plan still fits the setup"] : []),
    ...(draft.confidence != null && draft.confidence <= 2 ? ["Setup quality is low; keep it in watch/review"] : []),
  ].slice(0, 4);
  const decisionRows = decisionRecordRows({
    workflow: draft as WorkflowState,
    reviewState,
    currentPrice: item?.close,
    currentChangePct: item?.pct_change,
  });
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

  useEffect(() => {
    let cancelled = false;
    setReviewError(null);
    setOverrideReason("");
    if (!draft.setup_id) {
      onSetupReviewChange(symbol, null);
      return () => { cancelled = true; };
    }
    setReviewBusy(true);
    getSetupReview(draft.setup_id)
      .then((review) => {
        if (!cancelled) onSetupReviewChange(symbol, review);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          onSetupReviewChange(symbol, null);
          setReviewError(error instanceof Error ? error.message : "Setup review is unavailable.");
        }
      })
      .finally(() => {
        if (!cancelled) setReviewBusy(false);
      });
    return () => { cancelled = true; };
  }, [draft.setup_id, onSetupReviewChange, symbol]);

  async function patch(updates: Partial<WorkflowState>) {
    const reviewAffectingFields = ["entry", "stop", "target", "position_size", "thesis", "invalidation_rule", "tags"];
    const needsNewReview = Object.keys(updates).some((key) => reviewAffectingFields.includes(key));
    const nextUpdates = needsNewReview && draft.lifecycle === "ready"
      ? { ...updates, lifecycle: "watch" as const }
      : updates;
    const lifecycleFlags = nextUpdates.lifecycle ? workflowLifecycleFlags(nextUpdates.lifecycle) : {};
    const next = await upsertWorkflowState({
      ...draft,
      ...nextUpdates,
      ...lifecycleFlags,
      symbol,
      watchlist_id: watchlistId,
      source: draft.source ?? "watchlist",
    });
    if (needsNewReview) {
      onSetupReviewChange(symbol, null);
      setReviewError(null);
    }
    onPlanChange(next);
  }

  async function ensureSetupForReview(): Promise<{ id: string; setup: Setup }> {
    if (!Number.isInteger(draft.position_size) || (draft.position_size ?? 0) < 1) {
      throw new Error("Position size must be a positive whole number.");
    }
    const input = setupReviewInput(draft as WorkflowState);
    const update = setupUpdatePayload(draft as WorkflowState);
    if (draft.setup_id) {
      const updated = await updateSetup(draft.setup_id, update);
      return { id: updated.id, setup: updated };
    }
    const created = await createSetup({
      symbol,
      direction: input.direction ?? "long",
      strategy_tag: input.strategy_tag,
      entry_low: input.entry_low,
      entry_high: input.entry_high,
      stop_price: input.stop_price,
      target_price: input.target_price,
      planned_quantity: input.planned_quantity,
      thesis: input.thesis,
      invalidation_reason: input.invalidation_reason,
      source: "watchlist",
      source_scanner_candidate_id: input.source_scanner_candidate_id,
      scanner_context: input.scanner_context,
    });
    await patch({ setup_id: created.id });
    return { id: created.id, setup: created };
  }

  async function runReview(reason = overrideReason): Promise<SetupReview | null> {
    if (!status.valid) return null;
    setReviewBusy(true);
    setReviewError(null);
    try {
      const { id, setup } = await ensureSetupForReview();
      const result = await reviewSetup(id, {
        override_reason: reason.trim() || null,
      }, setup);
      onSetupReviewChange(symbol, result);
      if (!result.can_proceed) onToast(result.summary);
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Setup review could not be recorded.";
      setReviewError(message);
      onToast(message);
      return null;
    } finally {
      setReviewBusy(false);
    }
  }

  async function markReady() {
    const result = await runReview();
    if (!result?.can_proceed) return;
    await patch({ lifecycle: "ready" });
    trackEvent("decision_desk_plan_ready", { symbol, watchlist_id: watchlistId ?? null });
    onToast(`${symbol} marked ready`);
  }

  return (
    <section style={{ borderTop: "1px solid rgba(255,255,255,0.07)", padding: "12px 14px", background: "rgba(255,255,255,0.02)", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: expanded ? 10 : 0 }}>
        <div>
          <div className="label" style={{ marginBottom: 3 }}>Decision desk</div>
          <div className="caption">
            Status: {decisionLifecycleLabel(draft as WorkflowState)}
            {!expanded && status.next ? ` · ${status.next}` : ""}
          </div>
        </div>
        <div className="workspace-pill-row" style={{ marginTop: 0 }}>
          {!expanded ? (
            <button className="workspace-chip-button active" onClick={() => onExpandedChange(true)}>
              Start planning
            </button>
          ) : (
            <>
              <button className={`workspace-chip-button${status.valid ? " active" : ""}`} disabled={!status.valid || reviewBusy} onClick={() => void markReady()} style={{ opacity: status.valid ? 1 : 0.45 }}>
                Ready
              </button>
              <button
                className="workspace-chip-button"
                disabled={!hasTradePlan || draft.lifecycle !== "ready" || setupReview?.can_proceed !== true}
                onClick={() => hasTradePlan ? onDraftOrder(symbol) : onToast("Complete entry, stop, and target first.")}
                style={{ opacity: hasTradePlan && draft.lifecycle === "ready" && setupReview?.can_proceed === true ? 1 : 0.45 }}
              >
                Draft order
              </button>
              <button className="workspace-chip-button" onClick={() => onExpandedChange(false)}>
                Collapse
              </button>
            </>
          )}
        </div>
      </div>
      {!expanded ? null : (
        <>
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
        <div className="label" style={{ marginBottom: 4 }}>{status.valid ? "Plan ready" : "Next workflow step"}</div>
        <div className="caption" style={{ color: status.valid ? "var(--gain)" : "var(--warn)", lineHeight: 1.55 }}>
          {status.valid
            ? (riskReward ? `Ready for journal capture draft. Risk/reward ${riskReward}.` : "Ready for journal capture draft.")
            : (planNudges.length ? planNudges.join(" · ") : status.next)}
        </div>
      </div>
      <div
        data-testid="setup-review-status"
        style={{
          marginBottom: 10,
          padding: "8px 10px",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.07)",
          background: setupReview?.overall_status === "passed" ? "rgba(27,191,114,0.055)" : setupReview?.overall_status === "blocked" ? "rgba(229,56,59,0.08)" : "rgba(217,119,6,0.08)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
          <div className="label">Setup review</div>
          <span className="caption" style={{ color: setupReview?.overall_status === "passed" ? "var(--gain)" : setupReview?.overall_status === "blocked" ? "var(--loss)" : "var(--warn)" }}>
            {reviewBusy ? "Checking..." : setupReview ? setupReview.overall_status : "Not evaluated"}
          </span>
        </div>
        <div className="caption" style={{ marginTop: 4, lineHeight: 1.5 }}>
          {reviewError ?? setupReview?.summary ?? "Run the recorded rulebook before marking this setup ready."}
        </div>
        {setupReview && setupReview.results.some((result) => result.status === "fail") && (
          <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
            {setupReview.results.filter((result) => result.status === "fail").map((result) => (
              <div key={result.code} className="caption" style={{ color: result.severity === "block" ? "var(--loss)" : "var(--warn)" }}>
                {result.label}: {result.message}
              </div>
            ))}
          </div>
        )}
        {setupReview?.overall_status === "warned" && !setupReview.can_proceed && (
          <input
            aria-label="Override reason"
            placeholder="Reason for overriding the warning"
            value={overrideReason}
            onChange={(event) => setOverrideReason(event.target.value)}
            style={{ ...inputStyle, marginTop: 8 }}
          />
        )}
        <button
          className="workspace-chip-button"
          disabled={!status.valid || reviewBusy || (setupReview?.overall_status === "warned" && !setupReview.can_proceed && !overrideReason.trim())}
          onClick={() => void runReview()}
          style={{ marginTop: 8, opacity: status.valid && !reviewBusy ? 1 : 0.45 }}
        >
          {setupReview?.overall_status === "warned" && !setupReview.can_proceed ? "Acknowledge warning" : setupReview ? "Re-run setup review" : "Run setup review"}
        </button>
      </div>
      <div
        data-testid="watchlist-decision-record"
        style={{
          marginBottom: 10,
          padding: "8px 10px",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(255,255,255,0.03)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", marginBottom: 7 }}>
          <div className="label">Decision record</div>
          <span className="caption" style={{ color: "var(--text-tertiary)" }}>
            {draft.updated_at ? `Updated ${new Date(draft.updated_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}` : "Local draft"}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6 }}>
          {decisionRows.map((row) => (
            <div key={`${row.label}-${row.value}`} style={{ minWidth: 0 }}>
              <div className="caption" style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{row.label}</div>
              {row.label === "Journal" && journalHref && row.value === "No linked journal yet" ? (
                <Link href={journalHref} className="workspace-chip-button" style={{ marginTop: 4, fontSize: 11, textDecoration: "none", display: "inline-flex" }}>
                  Start journal draft
                </Link>
              ) : (
                <div style={{ fontSize: 12, lineHeight: 1.35, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.value}>
                  {row.value}
                </div>
              )}
            </div>
          ))}
        </div>
        {(draft.thesis?.trim() || draft.invalidation_rule?.trim() || draft.notes?.trim()) && (
          <div style={{ display: "grid", gap: 5, marginTop: 8 }}>
            {draft.thesis?.trim() && (
              <div className="caption" style={{ lineHeight: 1.5 }}><span style={{ color: "var(--text-primary)" }}>Thesis:</span> {draft.thesis}</div>
            )}
            {draft.invalidation_rule?.trim() && (
              <div className="caption" style={{ lineHeight: 1.5 }}><span style={{ color: "var(--text-primary)" }}>Invalidation:</span> {draft.invalidation_rule}</div>
            )}
            {draft.notes?.trim() && (
              <div className="caption" style={{ lineHeight: 1.5 }}><span style={{ color: "var(--text-primary)" }}>Notes:</span> {draft.notes}</div>
            )}
          </div>
        )}
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
        <select value={direction} onChange={(e) => {
          const nextDirection = e.target.value as "long" | "short";
          const tags = (draft.tags ?? []).filter((tag) => tag !== "long" && tag !== "short");
          void patch({ tags: [...tags, nextDirection] });
        }} style={inputStyle} aria-label="Trade direction">
          <option value="long">Long</option>
          <option value="short">Short</option>
        </select>
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
      <div className="label" style={{ marginTop: 10, marginBottom: 6 }}>Context</div>
      <div className="decision-desk-secondary-grid" style={{ display: "grid", gridTemplateColumns: "90px 1fr 1fr 110px", gap: 8 }}>
        <select value={draft.timeframe ?? "D"} onChange={(e) => patch({ timeframe: e.target.value })} style={inputStyle}>
          <option value="D">D</option>
          <option value="W">W</option>
          <option value="M">M</option>
        </select>
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
        </>
      )}
    </section>
  );
}

// ─── Chart + order panel ──────────────────────────────────────────────────────

function ChartPanel({
  symbol,
  companyName,
  latestClose,
  watchlistName,
  onOpenChart,
  onOpenChartDraw,
  onStepSymbol,
  plan,
  setupReview,
  planValid,
  planNextAction,
  orderDraftNonce,
  chartFocused,
  onChartFocus,
  showKeyboardHints,
}: {
  symbol: string;
  companyName?: string | null;
  latestClose?: number | null;
  watchlistName?: string | null;
  onOpenChart: (symbol: string) => void;
  onOpenChartDraw: (symbol: string) => void;
  onStepSymbol: (direction: "prev" | "next") => void;
  plan: WorkflowState | null;
  setupReview: SetupReview | null;
  planValid: boolean;
  planNextAction: string;
  orderDraftNonce?: number;
  chartFocused: boolean;
  onChartFocus: () => void;
  showKeyboardHints: boolean;
}) {
  const orderIntent = useOrderIntentKey();
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
  const [brokerStatusError, setBrokerStatusError] = useState<string | null>(null);
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
    ...(planValid && (plan?.lifecycle !== "ready" || plan.setup_id == null || setupReview?.can_proceed !== true)
      ? ["Run setup review and mark the plan Ready before journal capture"]
      : []),
    ...(planRiskReward != null && planRiskReward < 2 ? ["R:R below 2.0; review risk before submitting"] : []),
    ...(chartRangeNote ? [chartRangeNote] : []),
    ...(brokerStatusError ? ["Broker status unavailable; order capture stays as a journal draft"] : []),
    ...(brokerStatus?.plan_allows_broker === false ? ["Broker import requires Pro or Elite"] : []),
    ...(brokerStatus?.token_expired ? ["Broker token expired; import/reconnect before syncing trades"] : []),
  ].slice(0, 3);
  const canRouteLiveOrder = false;
  useEffect(() => {
    if (!orderDraftNonce) return;
    setShowOrderTicket(true);
  }, [orderDraftNonce]);
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
    getBrokerStatus()
      .then((status) => {
        setBrokerStatus(status);
        setBrokerStatusError(null);
      })
      .catch((error) => {
        setBrokerStatus(null);
        setBrokerStatusError(accountDataErrorMessage(error, "Broker status is temporarily unavailable. Existing broker access is not being treated as disconnected."));
      });
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
    if (!plan?.setup_id || plan.lifecycle !== "ready" || setupReview?.can_proceed !== true) {
      setOrderMsg({ ok: false, text: "Run setup review and mark the plan Ready before journal capture." });
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
        setup_id: plan?.setup_id ?? null,
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
      req.idempotency_key = orderIntent.keyFor(req);
      const result = await placeOrder(req);
      orderIntent.reset();
      trackEvent(canRouteLiveOrder && liveConfirmed ? "broker_order_submitted" : "mock_order_drafted", { source: "watchlist", symbol, side, order_type: orderType, broker: result.broker });
      setOrderMsg({
        ok: true,
        text: result.broker === "simulated"
          ? `${side === "buy" ? "Buy" : "Sell"} plan saved as a journal capture draft.`
          : result.message,
        journalReady: Boolean(result.journal_id),
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
    <div
      className="watchlist-chart-panel-inner"
      style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}
      tabIndex={0}
      onFocus={onChartFocus}
      data-testid="watchlist-chart-focus-surface"
    >
      <Link
        href={`/charts/${encodeURIComponent(symbol)}`}
        className="watchlist-sticky-next workspace-chip-button active"
        data-testid="watchlist-sticky-next"
        style={{ textDecoration: "none" }}
      >
        Next: Plan on chart →
      </Link>
      {/* Topbar */}
      <div className="workspace-card-header watchlist-chart-header" style={{ background: "rgba(255,255,255,0.02)", paddingBottom: 8, flexShrink: 0 }}>
        <div className="watchlist-chart-title">
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span className="mono" style={{ fontSize: 16, fontWeight: 700 }}>{symbol}</span>
            {displayCompanyName(symbol, companyName) && (
              <span className="caption" style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {displayCompanyName(symbol, companyName)}
              </span>
            )}
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
              Data as of {chartSource.asOf ?? "latest available"}
              {chartRangeNote ? ` · ${chartRangeNote}` : ""}
            </div>
          )}
          {(chartWorkspace.error || chartWorkspace.saveError) && (
            <div data-testid="watchlist-chart-workspace-status" className="caption" style={{ marginTop: 3, color: "var(--warn)" }}>
              {chartWorkspace.saveError ?? chartWorkspace.error}
            </div>
          )}
        </div>
        <div className="watchlist-chart-controls">
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button onClick={() => onStepSymbol("prev")} className="workspace-chip-button">
                ← Prev
              </button>
              <button onClick={() => onStepSymbol("next")} className="workspace-chip-button">
                Next →
              </button>
            </div>
            {showKeyboardHints && chartFocused && (
              <div className="watchlist-keyboard-hints caption" data-testid="watchlist-keyboard-hints">
                ←/→ or J/K · Space for next
              </div>
            )}
          </div>
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
            intradayEnabled={liveQuotePollingEnabled}
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
            {
              label: "Structure",
              value: chartStats.trend,
              tone: chartStats.trend === "Uptrend" ? "gain" : chartStats.trend === "Downtrend" ? "amber" : "neutral",
              magnitude: chartStats.trend === "Uptrend" ? 78 : chartStats.trend === "Downtrend" ? 42 : 55,
            },
            {
              label: `${tf} move`,
              value: chartStats.change != null ? `${chartStats.change >= 0 ? "+" : ""}${chartStats.change.toFixed(2)}%` : "-",
              tone: (chartStats.change ?? 0) >= 0 ? "gain" : "amber",
              magnitude: Math.min(100, Math.abs(chartStats.change ?? 0) * 12),
            },
          ].map((item) => (
            <div
              key={item.label}
              className={`watchlist-structure-card watchlist-structure-card--${item.tone}`}
              style={{ minWidth: 0 }}
            >
              <div className="label" style={{ marginBottom: 3 }}>{item.label}</div>
              <div className="mono" style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.value}</div>
              <div className="watchlist-magnitude-bar" aria-hidden="true">
                <span style={{ width: `${item.magnitude}%` }} />
              </div>
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
            <div className="watchlist-ohlc-group">
              {[
                { label: "Open", value: latestBar ? latestBar.open.toFixed(2) : "-" },
                { label: "High", value: latestBar ? latestBar.high.toFixed(2) : "-" },
                { label: "Low", value: latestBar ? latestBar.low.toFixed(2) : "-" },
                { label: "Close", value: latestBar ? latestBar.close.toFixed(2) : "-", highlight: true },
              ].map((item) => (
                <div key={item.label} className={`watchlist-ohlc-cell${item.highlight ? " highlight" : ""}`}>
                  <div className="label" style={{ marginBottom: 3 }}>{item.label}</div>
                  <div className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{item.value}</div>
                </div>
              ))}
            </div>
            {[
              { label: "Support", value: chartStats ? formatNullablePrice(chartStats.support) : "-", dot: "support" as const },
              { label: "Resistance", value: chartStats ? formatNullablePrice(chartStats.resistance) : "-", dot: "resistance" as const },
              { label: "Last volume", value: chartStats?.latestVolume != null ? formatCompactVolume(chartStats.latestVolume) : "-" },
              { label: "Bars", value: chartStats ? String(chartStats.sampleSize) : "-" },
            ].map((item) => (
              <div key={item.label} className="watchlist-ohlc-cell">
                <div className="label" style={{ marginBottom: 3, display: "flex", alignItems: "center", gap: 6 }}>
                  {item.dot && <span className={`watchlist-level-dot watchlist-level-dot--${item.dot}`} aria-hidden="true" />}
                  {item.label}
                </div>
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

        <div style={{ marginBottom: 10, padding: "8px 10px", borderRadius: 12, background: brokerStatusError ? "rgba(217,119,6,0.08)" : "rgba(255,255,255,0.03)", border: brokerStatusError ? "1px solid rgba(217,119,6,0.22)" : "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <span data-testid="watchlist-order-broker-status" style={{ fontSize: 11, fontWeight: 700, color: brokerStatusError ? "var(--warn)" : brokerStatus?.connected ? "var(--gain)" : "var(--text-secondary)" }}>
            {brokerStatusError ? "Broker status unavailable" : brokerStatus?.status_label ?? "Checking broker route..."}
          </span>
          <span className="caption">
            {brokerStatusError
              ? `${brokerStatusError} Order capture stays as a journal draft.`
              : brokerStatus?.connected ? "Broker import available; order capture still records as a journal draft" : "Order capture records as a journal draft"}
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
              <div style={{ marginTop: 4, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                  Source: {watchlistName ? `${watchlistName} queue` : "Watchlist"} · Setup: {setupType || "—"}
                </span>
                <a href={`/journal?symbol=${encodeURIComponent(symbol)}`} style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)" }}>
                  Review journal
                </a>
              </div>
            )}
          </div>
        )}

        {brokerStatus?.plan_allows_broker === false && (
          <div style={{ marginBottom: 8, padding: "8px 10px", borderRadius: 12, background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.22)" }}>
            <div className="caption" style={{ color: "var(--warn)", lineHeight: 1.5 }}>
              Broker import requires Pro or Elite. Journal capture remains available for planning.
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

        <button onClick={handleOrder} disabled={orderBusy || !planValid || !plan?.setup_id || plan.lifecycle !== "ready" || setupReview?.can_proceed !== true || (canRouteLiveOrder && !liveConfirmed)}
          style={{
            width: "100%", padding: "10px 0", borderRadius: 12, border: "none",
            background: side === "buy" ? "var(--gain)" : "var(--loss)", color: "#fff",
            fontSize: 12, fontWeight: 700, cursor: orderBusy || !planValid || !plan?.setup_id || plan.lifecycle !== "ready" || setupReview?.can_proceed !== true ? "not-allowed" : "pointer",
            opacity: orderBusy || !planValid || !plan?.setup_id || plan.lifecycle !== "ready" || setupReview?.can_proceed !== true || (canRouteLiveOrder && !liveConfirmed) ? 0.5 : 1,
          }}>
          {orderBusy
            ? canRouteLiveOrder && liveConfirmed ? "Submitting..." : "Saving..."
            : planValid && plan?.setup_id && plan.lifecycle === "ready" && setupReview?.can_proceed === true
              ? canRouteLiveOrder ? `${side === "buy" ? "Buy" : "Sell"} via ${brokerStatus?.broker ?? "broker"}` : `Save ${side === "buy" ? "buy" : "sell"} journal draft`
              : planValid ? "Run setup review and mark Ready" : planNextAction}
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
  const [watchlistError, setWatchlistError] = useState<string | null>(null);
  const [newWlName, setNewWlName] = useState("");
  const [showNewWl, setShowNewWl] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [chartSymbol, setChartSymbol] = useState<string | null>(null);
  const [orderDraftRequest, setOrderDraftRequest] = useState<{ symbol: string; nonce: number } | null>(null);

  const [symbolInput, setSymbolInput] = useState("");
  const [addMsg, setAddMsg] = useState("");
  const [adding, setAdding] = useState(false);
  const [searchResults, setSearchResults] = useState<SymbolSearchResult[]>([]);
  const [symbolSearchError, setSymbolSearchError] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [listQuery, setListQuery] = useState("");
  const [denseRows, setDenseRows] = useState(true);
  const [localMeta, setLocalMeta] = useState<Record<string, WatchlistItemMetadataUpdate>>({});
  const [tagInput, setTagInput] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [queueView, setQueueView] = useState<"all" | "pinned" | "tagged" | "needs-review">("all");
  const [activeTagFilter, setActiveTagFilter] = useState<string>("all");
  const [sortMode, setSortMode] = useState<"manual" | "setup" | "move" | "volume" | "rsi">("manual");
  const [showQueueGear, setShowQueueGear] = useState(false);
  const [chartFocused, setChartFocused] = useState(false);
  const [keyboardHintSessions, setKeyboardHintSessions] = useState(0);
  const [decisionDeskExpandedMap, setDecisionDeskExpandedMap] = useState<Record<string, boolean>>({});
  const [showSelectedMeta, setShowSelectedMeta] = useState(false);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [journalLoadError, setJournalLoadError] = useState<string | null>(null);
  const [queuePage, setQueuePage] = useState(0);
  const [quotesAsOf, setQuotesAsOf] = useState<string | null>(null);
  const [liveQuotesError, setLiveQuotesError] = useState<string | null>(null);
  const [workflowBySymbol, setWorkflowBySymbol] = useState<Record<string, WorkflowState>>({});
  const [setupReviewsBySymbol, setSetupReviewsBySymbol] = useState<Record<string, SetupReview | null>>({});
  const [fundamentalsBySymbol, setFundamentalsBySymbol] = useState<Record<string, { loading: boolean; data: Fundamentals | null; error: boolean }>>({});
  const appliedChartDrafts = useRef<Set<string>>(new Set());
  const pendingRouteSymbolRef = useRef<string | null>(null);
  const routeAutoAddAttempts = useRef<Set<string>>(new Set());

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const metaKey = "alphavyuh-watchlist-meta-v1";

  function itemMetaKey(watchlistId: string, symbol: string) {
    return `${watchlistId}:${symbol}`;
  }

  useEffect(() => {
    setKeyboardHintSessions(readKeyboardHintSessions());
    setDecisionDeskExpandedMap(readDecisionDeskExpandedMap());
  }, []);

  function setDecisionDeskExpanded(symbol: string, expanded: boolean) {
    setDecisionDeskExpandedMap((prev) => {
      const next = { ...prev, [symbol]: expanded };
      writeDecisionDeskExpandedMap(next);
      return next;
    });
  }

  function handleChartFocus() {
    setChartFocused(true);
    bumpKeyboardHintSession();
    setKeyboardHintSessions(readKeyboardHintSessions());
  }

  const handleSetupReviewChange = useCallback((symbol: string, review: SetupReview | null) => {
    setSetupReviewsBySymbol((previous) => ({ ...previous, [symbol]: review }));
  }, []);

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
    } catch {
      setLocalMeta((prev) => ({
        ...prev,
        [itemMetaKey(activeId, symbol)]: {
          pinned: updates.pinned ?? previous.pinned,
          tags: updates.tags ?? previous.tags,
          note: updates.note ?? previous.note,
        },
      }));
      showToast(WATCHLIST_LOCAL_META_MESSAGE);
    }
  }

  function showToast(msg: string) {
    sonnerToast.success(msg);
  }

  const openOrderDraft = useCallback((symbol: string) => {
    setChartSymbol(symbol);
    setDecisionDeskExpanded(symbol, true);
    setOrderDraftRequest({ symbol, nonce: Date.now() });
    trackEvent("watchlist_order_draft_opened", {
      symbol,
      watchlist_id: activeId ?? null,
      source: "watchlist_action",
    });
  }, [activeId]);

  function watchlistUnavailableMessage(): string {
    return WATCHLIST_DATA_UNAVAILABLE_MESSAGE;
  }

  async function loadWatchlists() {
    const requestedWatchlistId = searchParams.get("id");
    const requestedSymbol = searchParams.get("symbol")?.toUpperCase() ?? null;
    if (!requestedSymbol) pendingRouteSymbolRef.current = null;
    setWatchlistError(null);
    try {
      const liteLists = await getWatchlists({ lite: true });
      setWatchlists(liteLists);
      if (liteLists.length > 0 && !activeId) {
        setActiveId(liteLists.some((list) => list.id === requestedWatchlistId) ? requestedWatchlistId : liteLists[0].id);
      }
    } catch {
      setWatchlistError(watchlistUnavailableMessage());
      setLoading(false);
      if (requestedSymbol) setChartSymbol(requestedSymbol);
      return;
    }
    if (requestedSymbol) setChartSymbol(requestedSymbol);
    setLoading(false);

    getWatchlists({ force: true })
      .then((enrichedLists) => {
        setWatchlistError(null);
        setWatchlists(enrichedLists);
        if (enrichedLists.length > 0 && !activeId) {
          setActiveId(enrichedLists.some((list) => list.id === requestedWatchlistId) ? requestedWatchlistId : enrichedLists[0].id);
        }
        if (requestedSymbol) setChartSymbol(requestedSymbol);
      })
      .catch(() => {
        setWatchlistError(watchlistUnavailableMessage());
      });
  }

  useEffect(() => { loadWatchlists(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = window.setTimeout(() => {
      getJournalEntries({ limit: 75 })
        .then((journal) => {
          setJournalLoadError(null);
          setJournalEntries(journal.entries);
        })
        .catch((error) => {
          setJournalEntries([]);
          setJournalLoadError(error instanceof Error ? error.message : "Journal entries are temporarily unavailable.");
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
    if (planDraftParam !== "chart" && (!requestedSymbol || matchedRequestedSymbol)) {
      router.replace("/watchlist", { scroll: false });
    }
  }, [planDraftParam, symbolParam, watchlistIdParam, watchlists, router]);

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
      const attemptKey = `${activeId}:${requestedSymbol}`;
      if (routeAutoAddAttempts.current.has(attemptKey)) {
        if (planDraftParam !== "chart") router.replace("/watchlist", { scroll: false });
        return;
      }
      routeAutoAddAttempts.current.add(attemptKey);
      addToWatchlist(activeId, requestedSymbol)
        .then(() => getQuotes([requestedSymbol]))
        .then(({ quotes, as_of }) => {
          if (as_of) setQuotesAsOf(as_of);
          const quote = quotes[requestedSymbol];
          const newItem = quote ? watchlistItemFromQuote(quote) : watchlistItemFromSymbol(requestedSymbol);
          setWatchlists(prev => prev.map(w => w.id === activeId ? { ...w, items: [...(w.items || []), newItem] } : w));
          setChartSymbol(requestedSymbol);
          trackEvent("watchlist_symbol_focused", { symbol: requestedSymbol, watchlist_id: activeId, source: "scanner_auto_add" });
        })
        .catch(() => {
          setChartSymbol(requestedSymbol);
          showToast(`${requestedSymbol} could not be added to the active watchlist. ${WATCHLIST_RECOVERY_MESSAGE}`);
          trackEvent("watchlist_symbol_focus_failed", { symbol: requestedSymbol, watchlist_id: activeId, source: "scanner_auto_add" });
        });
    }
    if (planDraftParam !== "chart") router.replace("/watchlist", { scroll: false });
  }, [planDraftParam, symbolParam, watchlists.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const applyDraft = async () => {
        try {
          const scannerContext = workflowBySymbol[draftSymbol]?.scanner_context ?? null;
          const setup = await createSetup({
            symbol: draft.symbol,
            direction: draft.side,
            strategy_tag: patch.setup_type,
            entry_low: draft.entry,
            entry_high: draft.entry,
            stop_price: draft.stop,
            target_price: draft.target,
            thesis: draft.thesis,
            invalidation_reason: draft.invalidationRule,
            source: "chart",
            source_scanner_candidate_id: scannerContext?.candidate_id ?? null,
            scanner_context: scannerContext,
            chart_snapshot: {
              source: draft.source,
              drawing_id: draft.drawingId,
              timeframe: draft.timeframe,
              entry_price: draft.entry,
              captured_at: draft.createdAt,
            },
          });
          const linkedPatch = { ...patch, setup_id: setup.id };
          window.localStorage.removeItem(key);
          setWorkflowBySymbol((prev) => ({
            ...prev,
            [draftSymbol]: {
              ...(prev[draftSymbol] ?? { symbol: draftSymbol, lifecycle: "idea" as WorkflowLifecycle }),
              ...linkedPatch,
            },
          }));
          await upsertWorkflowState(linkedPatch);
          trackEvent("chart_plan_draft_applied", { symbol: draftSymbol, watchlist_id: targetWatchlistId, source: "full_chart_drawing", playbook_score: draft.playbookScore, risk_reward: draft.riskReward, setup_id: setup.id });
          openOrderDraft(draftSymbol);
          showToast("Chart plan context loaded into Decision Desk. Journal ticket is ready.");
        } catch {
          appliedChartDrafts.current.delete(appliedKey);
          showToast("Setup could not be saved. The chart plan is still available to retry.");
        }
      };
      void applyDraft();
    } catch {
      showToast("Could not load chart plan draft");
    }
  }, [activeId, chartSymbol, openOrderDraft, planDraftParam, symbolParam, watchlistIdParam, watchlists, workflowBySymbol]);

  const activeWl = watchlists.find(w => w.id === activeId) ?? null;
  const chartHref = useCallback((symbol: string, draw?: "trendline") => {
    const params = new URLSearchParams({ from: "watchlist", full: "1" });
    if (draw) params.set("draw", draw);
    if (activeWl?.id) params.set("watchlistId", activeWl.id);
    if (activeWl?.name) params.set("watchlist", activeWl.name);
    return `/charts/${symbol}?${params.toString()}`;
  }, [activeWl?.id, activeWl?.name]);
  const prefetchWatchlistChart = useCallback((symbol: string) => {
    const request = getWatchlistChartRequest("3M");
    prefetchCandles(symbol, {
      limit: request.limit,
      timeframe: request.timeframe,
      from_date: request.from_date,
      to_date: request.to_date,
    });
  }, []);
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
      return matchesQueueView && matchesTagFilter && matchesQuery;
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
  }, [activeId, activeWl?.items, listQuery, getItemMeta, queueView, activeTagFilter, sortMode]);
  const queuePageCount = Math.max(1, Math.ceil(visibleItems.length / WATCHLIST_PAGE_SIZE));
  const pageStart = Math.min(queuePage, queuePageCount - 1) * WATCHLIST_PAGE_SIZE;
  const pageItems = visibleItems.slice(pageStart, pageStart + WATCHLIST_PAGE_SIZE);
  const pageSymbolsKey = pageItems.map(item => item.symbol).join(",");
  const selectedItem = activeWl?.items.find(item => item.symbol === chartSymbol) ?? null;
  const selectedItemMeta = getItemMeta(activeId, chartSymbol);
  const selectedReviewState = chartSymbol ? symbolReviewMap.get(chartSymbol) : null;
  const selectedWorkflow = chartSymbol ? workflowBySymbol[chartSymbol] ?? null : null;
  const selectedSetupReview = chartSymbol ? setupReviewsBySymbol[chartSymbol] ?? null : null;
  const selectedPlanStatus = workflowPlanStatus(selectedWorkflow);
  const decisionDeskExpanded = chartSymbol ? Boolean(decisionDeskExpandedMap[chartSymbol]) : false;
  const activeWorkflowStepIndex = WATCHLIST_QUEUE_STEPS.findIndex(
    (step) => step.key === resolveWatchlistQueueStep({
      chartSymbol,
      decisionExpanded: decisionDeskExpanded,
      plan: selectedWorkflow,
    }),
  );
  const showKeyboardHints = keyboardHintSessions < 3;
  const selectedFundamentals = chartSymbol ? fundamentalsBySymbol[chartSymbol] ?? null : null;
  const canReorder = !listQuery.trim() && queueView === "all" && activeTagFilter === "all" && sortMode === "manual";

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
      try {
        const { quotes, as_of } = await getQuotes(pageItems.map((item) => item.symbol));
        if (cancelled) return;
        setLiveQuotesError(null);
        if (as_of) setQuotesAsOf(as_of);
        setWatchlists(prev => prev.map(w => (
          w.id !== activeId
            ? w
            : {
                ...w,
                items: w.items.map(item => {
                  const quote = quotes[item.symbol];
                  return quote ? { ...item, close: quote.close, pct_change: quote.pct_change } : item;
                }),
              }
        )));
      } catch (error) {
        if (cancelled) return;
        setLiveQuotesError(error instanceof Error ? error.message : "Quote refresh is temporarily unavailable.");
      }
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
  }, [activeId, listQuery, queueView, activeTagFilter, sortMode]);

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

      if (chartFocused) {
        if (e.key === "ArrowDown" || e.key === "j" || e.key === "J") {
          e.preventDefault();
          moveSelection("next");
          return;
        }
        if (e.key === "ArrowUp" || e.key === "k" || e.key === "K") {
          e.preventDefault();
          moveSelection("prev");
          return;
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          moveSelection("next");
          return;
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          moveSelection("prev");
          return;
        }
        if (e.key === " ") {
          e.preventDefault();
          moveSelection("next");
          return;
        }
      }

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
  }, [chartFocused, chartHref, chartSymbol, moveSelection, router, visibleItems]);

  async function handleDeleteWatchlist(id: string) {
    if (!confirm("Delete this watchlist and all its stocks?")) return;
    try {
      await deleteWatchlist(id);
      const remaining = watchlists.filter(w => w.id !== id);
      setWatchlists(remaining);
      if (activeId === id) setActiveId(remaining[0]?.id ?? null);
      if (chartSymbol) setChartSymbol(null);
    } catch {
      showToast(WATCHLIST_DELETE_FAILED_MESSAGE);
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
    } catch {
      showToast(WATCHLIST_CREATE_FAILED_MESSAGE);
    }
  }

  const handleSearchInput = useCallback(async (q: string) => {
    setSymbolInput(q);
    if (q.length >= 1) {
      try {
        const results = await searchSymbols(q);
        setSearchResults(results.slice(0, 6));
        setSymbolSearchError("");
        setShowDropdown(true);
      } catch {
        setSearchResults([]);
        setSymbolSearchError(SYMBOL_SEARCH_FAILED_MESSAGE);
        setShowDropdown(true);
      }
    } else {
      setSearchResults([]);
      setSymbolSearchError("");
      setShowDropdown(false);
    }
  }, []);

  async function handlePickSymbol(symbol: string) {
    setSymbolInput(symbol);
    setShowDropdown(false);
    setSearchResults([]);
    setSymbolSearchError("");
    if (!activeId) return;
    setAdding(true);
    setAddMsg("");
    try {
      await addToWatchlist(activeId, symbol);
      const { quotes, as_of } = await getQuotes([symbol]);
      if (as_of) setQuotesAsOf(as_of);
      const quote = quotes[symbol.toUpperCase()];
      const newItem = quote ? watchlistItemFromQuote(quote) : watchlistItemFromSymbol(symbol);
      setWatchlists(prev => prev.map(w => w.id === activeId ? { ...w, items: [...w.items, newItem] } : w));
      setChartSymbol(symbol);
      setSymbolInput("");
      setAddMsg("Added");
    } catch (e: unknown) {
      setAddMsg(watchlistAddMessage(symbol, e));
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
      const addedSymbols: string[] = [];
      let failureCount = 0;

      for (const symbol of symbols) {
        try {
          await addToWatchlist(activeId, symbol);
          addedSymbols.push(symbol);
        } catch {
          failureCount += 1;
        }
      }

      let quotes: Record<string, ScanResult> = {};
      let as_of: string | null = null;
      if (addedSymbols.length) {
        try {
          const batch = await getQuotes(addedSymbols);
          quotes = batch.quotes;
          as_of = batch.as_of ?? null;
        } catch {
          showToast(`Starter symbols added, but quote refresh is temporarily unavailable. ${WATCHLIST_RECOVERY_MESSAGE}`);
        }
      }
      if (as_of) setQuotesAsOf(as_of);
      const newItems = addedSymbols.map((symbol, index) => {
        const quote = quotes[symbol.toUpperCase()];
        return quote ? { ...watchlistItemFromQuote(quote, index) } : watchlistItemFromSymbol(symbol, index);
      });

      if (newItems.length) {
        setWatchlists(prev => prev.map(w => w.id === activeId ? { ...w, items: [...w.items, ...newItems] } : w));
        setChartSymbol(newItems[0].symbol);
      }
      if (failureCount) {
        const message = newItems.length ? `Added ${newItems.length}; ${failureCount} could not be added. ${WATCHLIST_RECOVERY_MESSAGE}` : WATCHLIST_STARTER_FAILED_MESSAGE;
        setAddMsg(message);
        showToast(message);
      } else {
        setAddMsg(newItems.length ? "Starter list added" : "Already added");
      }
    } catch {
      setAddMsg(WATCHLIST_STARTER_FAILED_MESSAGE);
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
      const { quotes, as_of } = await getQuotes([sym]);
      if (as_of) setQuotesAsOf(as_of);
      const quote = quotes[sym];
      const newItem = quote ? watchlistItemFromQuote(quote) : watchlistItemFromSymbol(sym);
      setWatchlists(prev => prev.map(w => w.id === activeId ? { ...w, items: [...w.items, newItem] } : w));
      setChartSymbol(sym);
      setSymbolInput("");
      setAddMsg("Added");
    } catch (e: unknown) {
      setAddMsg(watchlistAddMessage(sym, e));
    } finally {
      setAdding(false);
      setTimeout(() => setAddMsg(""), 2500);
    }
  }

  async function handleRemove(symbol: string) {
    if (!activeId) return;
    try {
      await removeFromWatchlist(activeId, symbol);
      setWatchlists(prev =>
        prev.map(w => w.id === activeId ? { ...w, items: w.items.filter(i => i.symbol !== symbol) } : w)
      );
      if (chartSymbol === symbol) setChartSymbol(null);
    } catch {
      showToast(watchlistRemoveFailedMessage(symbol));
    }
  }

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !activeId) return;
    const activeList = watchlists.find((watchlist) => watchlist.id === activeId);
    if (!activeList) return;
    const oldIdx = activeList.items.findIndex(i => i.symbol === active.id);
    const newIdx = activeList.items.findIndex(i => i.symbol === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(activeList.items, oldIdx, newIdx).map((item, idx) => ({ ...item, sort_order: idx }));
    setWatchlists(prev =>
      prev.map(w => w.id === activeId ? { ...w, items: reordered } : w)
    );
    try {
      await reorderWatchlist(activeId, reordered.map(i => ({ symbol: i.symbol, sort_order: i.sort_order })));
    } catch {
      setWatchlists(prev =>
        prev.map(w => w.id === activeId ? activeList : w)
      );
      showToast(WATCHLIST_REORDER_FAILED_MESSAGE);
    }
  }, [activeId, watchlists]);

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
    setActiveTagFilter("all");
    setSortMode("manual");
    setListQuery("");
  }

  return (
    <div className="workspace-page" style={{ gap: 10, minHeight: "calc(100vh - 104px)" }}>
      <WorkflowDeskHeader pathname="/watchlist" compact showFlowCaption={false} />
      <div className="workspace-grid watchlist-workspace-grid" style={{ gridTemplateColumns: sidebarCollapsed ? '48px 360px minmax(0, 1fr)' : '252px 360px minmax(0, 1fr)', minHeight: "calc(100vh - 104px)" }}>

      {/* ── Watchlist tabs sidebar ─── */}
      {sidebarCollapsed ? (
        <div className="workspace-card workspace-card-muted watchlist-sidebar-panel" style={{ width: 46, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 14, gap: 10 }}>
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
                title={`${wl.name} · ${wl.items.length} stocks`}
                className="watchlist-sidebar-collapsed-item"
                style={{ lineHeight: 0 }}
              >
                <WatchlistAvatar name={wl.name} active={activeId === wl.id} size={28} />
                <span className="watchlist-sidebar-vertical-name">{wl.name}</span>
                <span className="watchlist-sidebar-count-badge">{wl.items.length}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <aside className="workspace-card workspace-card-muted watchlist-sidebar-panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
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
            ) : watchlistError ? (
              <div data-testid="watchlist-unavailable-sidebar" style={{ padding: "24px 16px", fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.7 }}>
                <div style={{ color: "var(--text-primary)", fontWeight: 700, marginBottom: 6 }}>Watchlist data unavailable</div>
                <div>{watchlistError}</div>
                <button className="workspace-chip-button" style={{ marginTop: 12 }} onClick={() => router.push("/data")}>
                  Open Data Status
                </button>
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
      <div className="workspace-card workspace-card-muted watchlist-list-panel" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
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
                <span style={{ fontSize: 11, fontWeight: 500, color: /failed|unavailable|error/i.test(addMsg) ? "var(--loss)" : "var(--gain)" }}>
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
                {showDropdown && (searchResults.length > 0 || symbolSearchError) && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-dropdown)", zIndex: 20, marginTop: 2, maxHeight: 200, overflowY: "auto", background: "var(--surface-float)", border: "1px solid var(--border-subtle)" }}>
                    {symbolSearchError && (
                      <div data-testid="watchlist-symbol-search-unavailable" style={{ padding: "8px 12px", fontSize: 12, color: "var(--warn)", lineHeight: 1.45 }}>
                        {symbolSearchError}
                      </div>
                    )}
                    {searchResults.map(s => (
                      <div key={s.symbol} onMouseDown={() => handlePickSymbol(s.symbol)}
                        style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid var(--border-subtle)" }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--surface-3)"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{s.symbol}</div>
                        <div className="caption" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {displayCompanyName(s.symbol, s.company_name) || s.company_name || ""}
                        </div>
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

        {activeWl && (
          <WatchlistWorkflowStrip
            activeStep={activeWorkflowStepIndex >= 0 ? activeWorkflowStepIndex : 0}
            hasItems={activeWl.items.length > 0}
            adding={adding}
            onAddStarter={() => void addStarterSymbols()}
            onOpenScanner={() => router.push("/scanner")}
          />
        )}

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
                    <WatchlistSignalPills item={selectedItem} />
                  </div>
                  <div className="caption" style={{ marginTop: 2, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {displayCompanyName(selectedItem.symbol, selectedItem.company_name) || selectedItem.sector || "Active watchlist symbol"}
                    {quotesAsOf ? ` · As of ${quotesAsOf}` : ""}
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
              {journalLoadError && (
                <div data-testid="watchlist-journal-status" className="caption" style={{ marginTop: 8, padding: "7px 9px", borderRadius: 10, background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.22)", color: "var(--warn)", lineHeight: 1.5 }}>
                  Journal review context is unavailable. {journalLoadError} Watchlist queue, chart review, and planning remain usable.
                </div>
              )}
              {liveQuotesError && (
                <div data-testid="watchlist-live-quotes-unavailable" className="caption" style={{ marginTop: 8, padding: "7px 9px", borderRadius: 10, background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.22)", color: "var(--warn)", lineHeight: 1.5 }}>
                  Live quote refresh is unavailable. {liveQuotesError} Last known prices remain visible until refresh succeeds.
                </div>
              )}
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
                  {journalLoadError ? (
                    <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 12, background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.22)" }}>
                      <div className="label" style={{ marginBottom: 6, color: "var(--warn)" }}>Review context unavailable</div>
                      <div className="caption" style={{ lineHeight: 1.65, color: "var(--warn)" }}>
                        {journalLoadError} Review badges are paused until Journal recovers.
                      </div>
                    </div>
                  ) : selectedReviewState && (
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
            <div className="workspace-pill-row" style={{ position: "relative" }}>
              {(queueView !== "all" || activeTagFilter !== "all" || sortMode !== "manual" || listQuery.trim()) && (
                <button className="workspace-chip-button" onClick={resetDeskView}>
                  Reset
                </button>
              )}
              <button
                className={`workspace-chip-button${showQueueGear ? " active" : ""}`}
                onClick={() => setShowQueueGear((current) => !current)}
                aria-label="Queue display settings"
                title="Queue display settings"
              >
                <Settings size={13} />
              </button>
              {showQueueGear && (
                <div
                  className="watchlist-queue-gear-popover"
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    right: 0,
                    zIndex: 40,
                    width: 260,
                    padding: 10,
                    borderRadius: 12,
                    background: "var(--surface-1)",
                    border: "1px solid var(--border-subtle)",
                    boxShadow: "var(--shadow-panel)",
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <div>
                    <div className="label" style={{ marginBottom: 6 }}>Row density</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className={`workspace-chip-button${denseRows ? "" : " active"}`} onClick={() => setDenseRows(false)}>
                        Comfortable
                      </button>
                      <button className={`workspace-chip-button${denseRows ? " active" : ""}`} onClick={() => setDenseRows(true)}>
                        Dense
                      </button>
                    </div>
                  </div>
                  {availableTags.length > 0 && (
                    <div>
                      <div className="label" style={{ marginBottom: 6 }}>Tag filter</div>
                      <select
                        value={activeTagFilter}
                        onChange={(e) => setActiveTagFilter(e.target.value)}
                        style={{ width: "100%", fontSize: 12, borderRadius: 8, padding: "7px 10px", background: "var(--surface-3)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
                      >
                        <option value="all">All tags</option>
                        {availableTags.map((tag) => (
                          <option key={tag} value={tag}>#{tag}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <div className="label" style={{ marginBottom: 6 }}>Sort</div>
                    <select
                      value={sortMode}
                      onChange={(e) => setSortMode(e.target.value as typeof sortMode)}
                      style={{ width: "100%", fontSize: 12, borderRadius: 8, padding: "7px 10px", background: "var(--surface-3)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
                    >
                      <option value="manual">Manual order</option>
                      <option value="setup">Sort by setup</option>
                      <option value="move">Sort by move</option>
                      <option value="volume">Sort by volume ratio</option>
                      <option value="rsi">Sort by RSI</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
            <div className="caption">
              {visibleItems.length > 0
                ? <>Showing <Num>{pageStart + 1}</Num>-<Num>{Math.min(pageStart + WATCHLIST_PAGE_SIZE, visibleItems.length)}</Num> of <Num>{visibleItems.length}</Num>. Arrow keys move through the full queue.</>
                : canReorder ? "Drag to reprioritize. Enter opens chart." : "Filtered or ranked view active."}
            </div>
          </div>
        </div>

        {/* Stock rows */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {watchlistError ? (
            <EmptyState
              icon={List}
              title="Watchlist data unavailable"
              description={`${watchlistError} Saved lists are not being treated as empty. Check Data Status for details.`}
              action={{ label: "Open Data Status", onClick: () => router.push("/data") }}
              testId="watchlist-empty-error"
            />
          ) : !activeWl ? (
            <EmptyState
              icon={Eye}
              title="No watchlist selected"
              description="Create or select a watchlist from the sidebar to see symbols here."
              testId="watchlist-empty-none-selected"
            />
          ) : activeWl.items.length === 0 ? (
            <EmptyState
              icon={List}
              title="This watchlist is empty"
              description="Add symbols from the scanner or search to start building this list."
              action={{ label: adding ? "Adding..." : "Add starter queue", onClick: () => void addStarterSymbols() }}
              testId="watchlist-empty-no-items"
            />
          ) : visibleItems.length === 0 ? (
            <EmptyState
              icon={Filter}
              title="No symbols match the current filter"
              description="The active filter excludes all symbols. Reset or widen it to see the full list."
              action={{ label: "Reset view", onClick: () => { setListQuery(""); resetDeskView(); } }}
              testId="watchlist-empty-filtered"
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
                        <th className="label" style={{ width: 96, padding: "8px 8px", textAlign: "right" }}>Action</th>
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
                            onPrefetchChart={prefetchWatchlistChart}
                            onDraftOrder={openOrderDraft}
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
                    <th className="label" style={{ width: 96, padding: "8px 8px", textAlign: "right" }}>Action</th>
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
                        onPrefetchChart={prefetchWatchlistChart}
                        onDraftOrder={openOrderDraft}
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
      <div className="workspace-card watchlist-chart-panel" style={{ minWidth: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {chartSymbol ? (
          <>
            <div style={{ flex: 1, minHeight: 0 }}>
              <ChartPanel
                key={chartSymbol}
                symbol={chartSymbol}
                companyName={selectedItem?.company_name ?? activeWl?.items.find((i) => i.symbol === chartSymbol)?.company_name}
                latestClose={visibleItems.find(i => i.symbol === chartSymbol)?.close ?? activeWl?.items.find(i => i.symbol === chartSymbol)?.close}
                watchlistName={activeWl?.name ?? null}
                onOpenChart={(sym) => router.push(chartHref(sym))}
                onOpenChartDraw={(sym) => router.push(chartHref(sym, "trendline"))}
                onStepSymbol={moveSelection}
                plan={selectedWorkflow}
                setupReview={selectedSetupReview}
                planValid={selectedPlanStatus.valid}
                planNextAction={selectedPlanStatus.next}
                orderDraftNonce={orderDraftRequest?.symbol === chartSymbol ? orderDraftRequest.nonce : 0}
                chartFocused={chartFocused}
                onChartFocus={handleChartFocus}
                showKeyboardHints={showKeyboardHints}
              />
            </div>
            <DecisionDesk
              symbol={chartSymbol}
              watchlistId={activeWl?.id ?? null}
              plan={selectedWorkflow}
              setupReview={selectedSetupReview}
              item={selectedItem}
              reviewState={selectedReviewState}
              expanded={decisionDeskExpanded}
              onExpandedChange={(expanded) => setDecisionDeskExpanded(chartSymbol, expanded)}
              onPlanChange={(next) => setWorkflowBySymbol((prev) => ({ ...prev, [next.symbol]: next }))}
              onSetupReviewChange={handleSetupReviewChange}
              onToast={showToast}
              onDraftOrder={openOrderDraft}
            />
          </>
        ) : (
          <div style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <EmptyState
              title="Click any stock to load its chart"
              description="Use the watchlist as your analysis desk. Select a symbol, then open the full chart for price, volume, and indicator context."
              action={{ label: "Run scanner for ideas", href: "/scanner" }}
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
