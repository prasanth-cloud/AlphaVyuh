"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
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
import { Plus, Trash2, GripVertical, X, Search, Pin, PinOff, Tag } from "lucide-react";
import dynamic from "next/dynamic";
import type { Watchlist, WatchlistItem, CandleBar, JournalEntry } from "@/lib/api";
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
  placeOrder,
  getQuoteLive,
  type PlaceOrderRequest,
  type WatchlistItemMetadataUpdate,
} from "@/lib/api";
import type { SymbolSearchResult } from "@/lib/api";
import { EmptyState } from "@/components/ui";

const MiniChart = dynamic(() => import("@/components/charts/MiniChart"), { ssr: false });

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
      {["1D", "1W", "1M", "3M", "6M", "1Y"].map(tf => (
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

// ─── Chart + order panel ──────────────────────────────────────────────────────

function ChartPanel({
  symbol,
  latestClose,
  watchlistName,
  onOpenChart,
  onStepSymbol,
}: {
  symbol: string;
  latestClose?: number | null;
  watchlistName?: string | null;
  onOpenChart: (symbol: string) => void;
  onStepSymbol: (direction: "prev" | "next") => void;
}) {
  const [candles, setCandles] = useState<CandleBar[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState(false);
  const [tf, setTf] = useState("3M");

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
    };
    const limitMap: Record<string, number> = {
      "1D": 60,
      "1W": 90,
      "1M": 30,
      "3M": 120,
      "6M": 180,
      "1Y": 260,
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

  async function handleOrder() {
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
      <div className="workspace-card-header" style={{ background: "rgba(255,255,255,0.02)", paddingBottom: 10, flexShrink: 0 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span className="mono" style={{ fontSize: 16, fontWeight: 700 }}>{symbol}</span>
            <span className="caption">{tf} preview · EMA 20/50/200</span>
          </div>
          <div className="workspace-pill-row" style={{ marginTop: 8 }}>
            <span className="workspace-pill">{referenceClose != null ? `Spot ${referenceClose.toFixed(2)}` : "Spot pending"}</span>
            {previewChange != null && (
              <span className="workspace-pill" style={{ color: previewChange >= 0 ? "var(--gain)" : "var(--loss)" }}>
                {previewChange >= 0 ? "+" : ""}{previewChange.toFixed(2)}%
              </span>
            )}
            {latestBar && (
              <span className="workspace-pill">
                Range {latestBar.low.toFixed(0)}-{latestBar.high.toFixed(0)}
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
            Open full chart
          </button>
          <TimeframeTabs active={tf} onChange={setTf} />
        </div>
      </div>

      {/* Chart */}
      <div style={{ padding: "0 14px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
          {[
            { label: "Open", value: latestBar ? latestBar.open.toFixed(2) : "—" },
            { label: "High", value: latestBar ? latestBar.high.toFixed(2) : "—" },
            { label: "Low", value: latestBar ? latestBar.low.toFixed(2) : "—" },
            { label: "Close", value: latestBar ? latestBar.close.toFixed(2) : "—" },
          ].map((item) => (
            <div key={item.label} style={{ padding: "8px 10px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="label" style={{ marginBottom: 3 }}>{item.label}</div>
              <div className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: "10px 14px 0" }}>
        {chartLoading ? (
          <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid var(--surface-3)", borderTopColor: "var(--accent)", animation: "spin 1s linear infinite" }}>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        ) : chartError ? (
          <span className="caption">No chart data</span>
        ) : (
          <MiniChart candles={candles} height={320} dark />
        )}
      </div>

      {/* Order panel */}
      <div style={{ flexShrink: 0, padding: "14px 16px 16px", borderTop: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.025)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
          <div>
            <div className="label" style={{ marginBottom: 4 }}>Quick order</div>
            <div className="caption">Keep execution attached to the active queue and auto-send the trade into journal review.</div>
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
                    border: `1px solid ${orderType === type ? "rgba(86,215,193,0.3)" : "var(--border-subtle)"}`,
                    background: orderType === type ? "rgba(86,215,193,0.08)" : "var(--surface-3)",
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

        <button onClick={handleOrder} disabled={orderBusy}
          style={{
            width: "100%", padding: "10px 0", borderRadius: 12, border: "none",
            background: side === "buy" ? "var(--gain)" : "var(--loss)", color: "#fff",
            fontSize: 12, fontWeight: 700, cursor: orderBusy ? "not-allowed" : "pointer",
            opacity: orderBusy ? 0.5 : 1,
          }}>
          {orderBusy ? "Placing…" : `Place ${side === "buy" ? "buy" : "sell"} order`}
        </button>
      </div>
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
  const [sortMode, setSortMode] = useState<"manual" | "move" | "volume" | "rsi">("manual");
  const [showDeskControls, setShowDeskControls] = useState(false);
  const [showSelectedMeta, setShowSelectedMeta] = useState(false);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);

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
    if (wls.length > 0 && !activeId) setActiveId(wls[0].id);
    setLoading(false);
  }

  useEffect(() => { loadWatchlists(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    getJournalEntries({ limit: 250 }).catch(() => ({ entries: [], total: 0 })).then((journal) => {
      setJournalEntries(journal.entries);
    });
  }, []);

  const activeSymbolsKey = (watchlists.find(w => w.id === activeId)?.items ?? [])
    .map(item => item.symbol)
    .join(",");

  useEffect(() => {
    if (!activeId) return;
    const active = watchlists.find(w => w.id === activeId);
    if (!active?.items?.length) return;
    const activeItems = active.items;

    let cancelled = false;

    async function refreshLiveQuotes() {
      const updates = await Promise.all(
        activeItems.map(async (item) => {
          const live = await getQuoteLive(item.symbol).catch(() => null);
          return live ? {
            symbol: item.symbol,
            close: live.close,
            pct_change: live.pct_change,
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
    const id = setInterval(refreshLiveQuotes, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  // We intentionally refresh only when the active watchlist or its symbol set changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, activeSymbolsKey]);

  const symbolParam = searchParams.get("symbol");
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
  const selectedItem = activeWl?.items.find(item => item.symbol === chartSymbol) ?? null;
  const selectedItemMeta = getItemMeta(activeId, chartSymbol);
  const selectedReviewState = chartSymbol ? symbolReviewMap.get(chartSymbol) : null;
  const selectedIndex = visibleItems.findIndex(item => item.symbol === chartSymbol);
  const canReorder = deskFilter === "all" && !listQuery.trim() && queueView === "all" && activeTagFilter === "all" && sortMode === "manual";

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
        router.push(`/charts/${chartSymbol}`);
      }
    }
    window.addEventListener("keydown", handleDeskKeys);
    return () => window.removeEventListener("keydown", handleDeskKeys);
  }, [chartSymbol, moveSelection, router, visibleItems]);

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

  const watchlistStats = [
    { label: 'Lists', value: String(watchlists.length) },
    { label: 'Names', value: activeWl ? `${visibleItems.length}/${activeWl.items.length}` : '0' },
    { label: 'Focus', value: chartSymbol || 'Pick one' },
    { label: 'Queue', value: selectedIndex >= 0 ? `${selectedIndex + 1}/${visibleItems.length}` : 'Idle' },
    { label: 'View', value: queueView === "needs-review" ? "Needs review" : queueView === "all" ? "All" : queueView[0].toUpperCase() + queueView.slice(1) },
  ];
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
    <div className="workspace-page">
      <div className="workspace-card" style={{ padding: "14px 18px", marginBottom: 16 }}>
        <div className="workspace-toolbar" style={{ minHeight: "auto", padding: 0, border: "none", gap: 14 }}>
          <div>
            <div className="workspace-card-title">Watchlist</div>
          </div>
          <div className="workspace-pill-row" style={{ gap: 8 }}>
            {watchlistStats.slice(1).map((item) => (
              <span key={item.label} className="workspace-pill">
                {item.label}: {item.value}
              </span>
            ))}
          </div>
        </div>
        {activeWl && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <div className="workspace-pill-row" style={{ gap: 8 }}>
              <span className="workspace-pill">All: {queueCounts.total}</span>
              <span className="workspace-pill">Pinned: {queueCounts.pinned}</span>
              <span className="workspace-pill">Tagged: {queueCounts.tagged}</span>
              <span className="workspace-pill">Needs review: {queueCounts.needsReview}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {(queueView !== "all" || deskFilter !== "all" || activeTagFilter !== "all" || sortMode !== "manual" || listQuery.trim()) && (
                <button className="workspace-chip-button" onClick={resetDeskView}>
                  Reset
                </button>
              )}
              <button className={`workspace-chip-button${showDeskControls ? " active" : ""}`} onClick={() => setShowDeskControls((current) => !current)}>
                {showDeskControls ? "Hide controls" : "Desk controls"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="workspace-grid" style={{ gridTemplateColumns: sidebarCollapsed ? '48px 360px minmax(0, 1fr)' : '252px 360px minmax(0, 1fr)' }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 88, left: "50%", transform: "translateX(-50%)", zIndex: 50, fontSize: 13, padding: "10px 16px", borderRadius: 16, boxShadow: "var(--shadow-panel)", background: "linear-gradient(180deg, rgba(20,29,33,0.96), rgba(13,20,24,0.96))", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" }}>
          {toast}
        </div>
      )}

      {/* ── Watchlist tabs sidebar ─── */}
      {sidebarCollapsed ? (
        <div className="workspace-card workspace-card-muted" style={{ width: 46, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 14 }}>
          <button onClick={() => setSidebarCollapsed(false)} style={{ color: "var(--text-tertiary)" }}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
              <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
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
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 20 }}>{wl.name}</div>
                      <div style={{ fontSize: 10, marginTop: 2, color: "var(--text-tertiary)" }}>{wl.items.length} stocks</div>
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
            <div className="workspace-card-title">
              {activeWl ? activeWl.name : "Watchlist"}
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
                style={{ padding: "5px 8px", borderRadius: "var(--radius-sm)", fontSize: 11, fontWeight: 700, background: "linear-gradient(180deg, var(--accent-strong), var(--accent))", color: "#04120d", border: "1px solid rgba(86,215,193,0.24)", cursor: "pointer", opacity: (adding || !symbolInput.trim()) ? 0.5 : 1 }}>
                {adding ? "…" : "Add"}
              </button>
            </div>
          )}
        </div>

        <div style={{ padding: "0 18px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
          {selectedItem ? (
            <div style={{ borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.025)", padding: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
                <div>
                  <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{selectedItem.symbol}</div>
                  <div className="caption" style={{ marginTop: 2, maxWidth: 260 }}>
                    {selectedItem.company_name || "Active watchlist focus"}
                    {selectedItem.sector ? ` · ${selectedItem.sector}` : ""}
                  </div>
                </div>
                <div className="workspace-pill-row" style={{ marginTop: 0 }}>
                  <button className="workspace-chip-button" onClick={() => router.push(`/charts/${selectedItem.symbol}?from=watchlist&watchlist=${encodeURIComponent(activeWl?.name ?? "")}`)}>
                    Open chart
                  </button>
                  <button className="workspace-chip-button" onClick={() => router.push(`/journal?symbol=${selectedItem.symbol}`)}>
                    Review journal
                  </button>
                  <button className={`workspace-chip-button${showSelectedMeta ? " active" : ""}`} onClick={() => setShowSelectedMeta((current) => !current)}>
                    {showSelectedMeta ? "Hide notes" : "Organize"}
                  </button>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, marginTop: 10 }}>
                {selectedMetrics.map((metric) => (
                  <div key={metric.label} style={{ padding: "8px 10px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className="label" style={{ marginBottom: 3 }}>{metric.label}</div>
                    <div className="mono" style={{ fontSize: 12, fontWeight: 600, color: metric.tone }}>{metric.value}</div>
                  </div>
                ))}
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
                      Latest lesson: {selectedReviewState.latestLesson.slice(0, 120)}{selectedReviewState.latestLesson.length > 120 ? "…" : ""}
                    </div>
                  )}
                </div>
              )}
              {showSelectedMeta && (
                <>
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
                  <option value="move">Sort by move</option>
                  <option value="volume">Sort by volume ratio</option>
                  <option value="rsi">Sort by RSI</option>
                </select>
              </>
            )}
            <div className="caption">
              {canReorder ? "Drag to reprioritize. Enter opens chart." : "Filtered or ranked view active."}
            </div>
          </div>
        </div>

        {/* Stock rows */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {!activeWl ? (
            <EmptyState title="No watchlist selected" description="Create or select a watchlist from the sidebar, then use it as the bridge from scanner ideas to chart review." />
          ) : activeWl.items.length === 0 ? (
            <EmptyState
              title="No stocks yet"
              description="Add stocks from the scanner, or type a symbol above. The chart panel will react as soon as the list has names."
              action={{ label: "Go to scanner", href: "/scanner" }}
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
                <SortableContext items={visibleItems.map(i => i.symbol)} strategy={verticalListSortingStrategy}>
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
                      {visibleItems.map(item => {
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
                          onOpenChart={(sym) => router.push(`/charts/${sym}?from=watchlist&watchlist=${encodeURIComponent(activeWl?.name ?? "")}`)}
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
                  {visibleItems.map(item => {
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
                      onOpenChart={(sym) => router.push(`/charts/${sym}?from=watchlist&watchlist=${encodeURIComponent(activeWl?.name ?? "")}`)}
                      dense={denseRows}
                    />
                    );
                  })}
                </tbody>
              </table>
            )
          )}
        </div>
      </div>

      {/* ── Chart + order panel ─────────────────────────────── */}
      <div className="workspace-card" style={{ minWidth: 0, overflow: "hidden" }}>
        {chartSymbol ? (
          <ChartPanel key={chartSymbol} symbol={chartSymbol}
            latestClose={visibleItems.find(i => i.symbol === chartSymbol)?.close ?? activeWl?.items.find(i => i.symbol === chartSymbol)?.close}
            watchlistName={activeWl?.name ?? null}
            onOpenChart={(sym) => router.push(`/charts/${sym}?from=watchlist&watchlist=${encodeURIComponent(activeWl?.name ?? "")}`)}
            onStepSymbol={moveSelection} />
        ) : (
          <div style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <EmptyState
              title="Click any stock to load its chart"
              description="Use the watchlist as your decision queue. Select the symbol you want to work on, then open the full chart when the setup deserves deeper analysis."
            />
          </div>
        )}
      </div>

      <style>{`
        .wl-item:hover .wl-delete { opacity: 1 !important; }
        tr:hover .remove-btn { opacity: 1 !important; }
        .watchlist-row:hover {
          background: linear-gradient(90deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01));
        }
        .watchlist-row[data-pinned="true"] {
          box-shadow: inset 2px 0 0 rgba(77,214,255,0.55);
        }
      `}</style>
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
