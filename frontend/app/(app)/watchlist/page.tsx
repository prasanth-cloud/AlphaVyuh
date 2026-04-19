"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
import { Plus, Trash2, GripVertical, X, Search } from "lucide-react";
import dynamic from "next/dynamic";
import type { Watchlist, WatchlistItem, CandleBar } from "@/lib/api";
import {
  getWatchlists,
  createWatchlist,
  deleteWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  reorderWatchlist,
  getQuote,
  searchSymbols,
  getCandles,
  placeOrder,
  type PlaceOrderRequest,
} from "@/lib/api";
import type { SymbolSearchResult } from "@/lib/api";
import RsiBadge from "@/components/scanner/RsiBadge";
import PctChange from "@/components/scanner/PctChange";

const MiniChart = dynamic(() => import("@/components/charts/MiniChart"), { ssr: false });

// ─── Sortable row ─────────────────────────────────────────────────────────────

function SortableRow({
  item,
  isHovered,
  onRemove,
  onHover,
}: {
  item: WatchlistItem;
  isHovered: boolean;
  onRemove: (symbol: string) => void;
  onHover: (symbol: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.symbol });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={{
        ...style,
        borderBottom: "1px solid var(--app-border2)",
        background: isHovered ? "var(--app-teal-dim)" : "transparent",
        cursor: "default",
      }}
      onMouseEnter={() => onHover(item.symbol)}
      onMouseLeave={() => onHover(null)}
      className="group transition-colors"
    >
      <td className="px-3 py-3 w-8" onClick={e => e.stopPropagation()}>
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none"
          style={{ color: "var(--app-text3)" }}
        >
          <GripVertical size={14} />
        </button>
      </td>
      <td className="px-3 py-3">
        <div className="text-[13px] font-semibold" style={{ color: "var(--app-text1)" }}>{item.symbol}</div>
        {item.company_name && (
          <div className="text-[10px] truncate max-w-[140px]" style={{ color: "var(--app-text3)" }}>{item.company_name}</div>
        )}
      </td>
      <td className="px-3 py-3 tabular-nums text-[12px] font-medium" style={{ color: "var(--app-text1)" }}>
        {item.close != null
          ? `₹${item.close.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
          : "—"}
      </td>
      <td className="px-3 py-3">
        <PctChange pct={item.pct_change ?? null} />
      </td>
      <td className="px-3 py-3 tabular-nums text-[12px]" style={{ color: "var(--app-teal)" }}>
        {item.volume_ratio != null ? `${item.volume_ratio.toFixed(2)}x` : "—"}
      </td>
      <td className="px-3 py-3">
        <RsiBadge rsi={item.rsi_14 ?? null} />
      </td>
      <td className="px-3 py-3 text-right" onClick={e => e.stopPropagation()}>
        <button
          onClick={() => onRemove(item.symbol)}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: "var(--app-text3)" }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--app-loss)"}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--app-text3)"}
        >
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
  );
}

// ─── Chart + order panel ──────────────────────────────────────────────────────

function ChartPanel({ symbol, latestClose }: { symbol: string; latestClose?: number | null }) {
  const [candles, setCandles] = useState<CandleBar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Order form state
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [orderBusy, setOrderBusy] = useState(false);
  const [orderMsg, setOrderMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(false);
    setCandles([]);
    getCandles(symbol, { limit: 120 })
      .then(d => {
        setCandles(d.candles);
        if (d.latest?.close && !price) setPrice(String(d.latest.close));
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  // Keep price in sync with latest close when switching symbols
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
      const req: PlaceOrderRequest = { symbol, side, quantity: qtyN, price: priceN, order_type: orderType };
      await placeOrder(req);
      setOrderMsg({ ok: true, text: `${side === "buy" ? "Buy" : "Sell"} order placed!` });
    } catch (e: unknown) {
      setOrderMsg({ ok: false, text: e instanceof Error ? e.message : "Order failed" });
    } finally {
      setOrderBusy(false);
      setTimeout(() => setOrderMsg(null), 4000);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 flex-shrink-0 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--app-border)" }}>
        <div>
          <div className="text-[13px] font-bold" style={{ color: "var(--app-text1)" }}>{symbol}</div>
          <div className="text-[10px]" style={{ color: "var(--app-text3)" }}>Daily · EMA 20/50/200</div>
        </div>
        <div className="flex items-center gap-2 text-[10px]" style={{ color: "var(--app-text3)" }}>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 rounded" style={{ background: "#00E5C4" }} />EMA20</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 rounded" style={{ background: "#818cf8" }} />EMA50</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 rounded" style={{ background: "#f59e0b" }} />EMA200</span>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
        {loading ? (
          <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "var(--app-teal)", borderTopColor: "transparent" }} />
        ) : error ? (
          <div className="text-[12px]" style={{ color: "var(--app-text3)" }}>No chart data</div>
        ) : (
          <MiniChart candles={candles} height={320} dark />
        )}
      </div>

      {/* Order panel */}
      <div className="flex-shrink-0 px-4 py-3" style={{ borderTop: "1px solid var(--app-border)", background: "var(--app-surface2)" }}>
        <div className="text-[10px] font-semibold uppercase tracking-[0.5px] mb-2" style={{ color: "var(--app-text3)" }}>Quick Order</div>

        {/* Buy / Sell tabs */}
        <div className="flex rounded-[7px] overflow-hidden mb-3" style={{ border: "1px solid var(--app-border)" }}>
          {(["buy", "sell"] as const).map(s => (
            <button key={s} onClick={() => setSide(s)}
              className="flex-1 py-1.5 text-[12px] font-semibold capitalize transition-colors"
              style={{
                background: side === s ? (s === "buy" ? "#26A65B" : "#E5383B") : "transparent",
                color: side === s ? "#fff" : "var(--app-text3)",
              }}>
              {s === "buy" ? "Buy" : "Sell"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <div className="text-[10px] mb-1" style={{ color: "var(--app-text3)" }}>Type</div>
            <select value={orderType} onChange={e => setOrderType(e.target.value as "market" | "limit")}
              className="w-full text-[12px] rounded-[6px] px-2 py-1.5 outline-none"
              style={{ background: "var(--app-surface3)", border: "1px solid var(--app-border)", color: "var(--app-text1)" }}>
              <option value="market">Market</option>
              <option value="limit">Limit</option>
            </select>
          </div>
          <div>
            <div className="text-[10px] mb-1" style={{ color: "var(--app-text3)" }}>Qty</div>
            <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)}
              className="w-full text-[12px] rounded-[6px] px-2 py-1.5 outline-none"
              style={{ background: "var(--app-surface3)", border: "1px solid var(--app-border)", color: "var(--app-text1)" }} />
          </div>
        </div>

        <div className="mb-2">
          <div className="text-[10px] mb-1" style={{ color: "var(--app-text3)" }}>Price (₹)</div>
          <input type="number" step="0.05" min="0" value={price} onChange={e => setPrice(e.target.value)}
            className="w-full text-[12px] rounded-[6px] px-2 py-1.5 outline-none"
            style={{ background: "var(--app-surface3)", border: "1px solid var(--app-border)", color: "var(--app-text1)" }} />
        </div>

        {orderMsg && (
          <div className="text-[11px] mb-2 font-medium"
            style={{ color: orderMsg.ok ? "var(--app-gain)" : "var(--app-loss)" }}>
            {orderMsg.text}
          </div>
        )}

        <button onClick={handleOrder} disabled={orderBusy}
          className="w-full py-2 rounded-[7px] text-[12px] font-bold disabled:opacity-50 transition-opacity"
          style={{ background: side === "buy" ? "#26A65B" : "#E5383B", color: "#fff" }}>
          {orderBusy ? "Placing…" : `Place ${side === "buy" ? "Buy" : "Sell"} Order`}
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WatchlistPage() {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newWlName, setNewWlName] = useState("");
  const [showNewWl, setShowNewWl] = useState(false);
  const [toast, setToast] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Hover-to-chart
  const [hoveredSymbol, setHoveredSymbol] = useState<string | null>(null);
  const [chartSymbol, setChartSymbol] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Symbol search + autocomplete
  const [symbolInput, setSymbolInput] = useState("");
  const [addMsg, setAddMsg] = useState("");
  const [adding, setAdding] = useState(false);
  const [searchResults, setSearchResults] = useState<SymbolSearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

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

  const handleRowHover = useCallback((symbol: string | null) => {
    setHoveredSymbol(symbol);
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (symbol) {
      hoverTimerRef.current = setTimeout(() => setChartSymbol(symbol), 80);
    }
  }, []);

  const activeWl = watchlists.find(w => w.id === activeId) ?? null;

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
        ? { symbol: quote.symbol, sort_order: 0, added_at: new Date().toISOString(), company_name: quote.company_name, sector: quote.sector, close: quote.close, pct_change: quote.pct_change, volume_ratio: quote.volume_ratio, rsi_14: quote.rsi_14 }
        : { symbol, sort_order: 0, added_at: new Date().toISOString() };
      setWatchlists(prev => prev.map(w => w.id === activeId ? { ...w, items: [...w.items, newItem] } : w));
      setSymbolInput("");
      setAddMsg("Added!");
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
    try {
      await addToWatchlist(activeId, sym);
      const quote = await getQuote(sym);
      const newItem: WatchlistItem = quote
        ? { symbol: quote.symbol, sort_order: 0, added_at: new Date().toISOString(), company_name: quote.company_name, sector: quote.sector, close: quote.close, pct_change: quote.pct_change, volume_ratio: quote.volume_ratio, rsi_14: quote.rsi_14 }
        : { symbol: sym, sort_order: 0, added_at: new Date().toISOString() };
      setWatchlists(prev => prev.map(w => w.id === activeId ? { ...w, items: [...w.items, newItem] } : w));
      setSymbolInput("");
      setAddMsg("Added!");
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

  const surfaceStyle: React.CSSProperties = {
    background: "var(--app-surface)",
    borderRight: "1px solid var(--app-border)",
  };

  return (
    <div className="flex h-full overflow-hidden" style={{ background: "var(--app-bg)" }}>
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 text-[13px] px-4 py-2 rounded-lg shadow-lg"
          style={{ background: "var(--app-surface2)", border: "1px solid var(--app-border)", color: "var(--app-text1)" }}>
          {toast}
        </div>
      )}

      {/* ── Left sidebar ──────────────────────────────────────────────── */}
      {sidebarCollapsed ? (
        <div className="w-[36px] flex-shrink-0 flex flex-col items-center pt-3 gap-3" style={surfaceStyle}>
          <button onClick={() => setSidebarCollapsed(false)} title="Show watchlists"
            style={{ color: "var(--app-text3)" }}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
              <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      ) : (
        <aside className="w-[200px] flex-shrink-0 flex flex-col h-full" style={surfaceStyle}>
          <div className="px-3 py-3 flex items-center justify-between"
            style={{ borderBottom: "1px solid var(--app-border)" }}>
            <span className="text-[13px] font-bold" style={{ color: "var(--app-text1)" }}>Watchlists</span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setShowNewWl(o => !o)} style={{ color: "var(--app-teal)" }}>
                <Plus size={15} />
              </button>
              <button onClick={() => setSidebarCollapsed(true)} title="Hide sidebar"
                style={{ color: "var(--app-text3)" }}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
                  <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>

          {showNewWl && (
            <div className="px-4 py-2.5 flex gap-1.5" style={{ borderBottom: "1px solid var(--app-border)" }}>
              <input
                autoFocus
                value={newWlName}
                onChange={e => setNewWlName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreateWatchlist()}
                placeholder="List name…"
                className="flex-1 text-[11px] rounded-[4px] px-2 py-1 outline-none"
                style={{ background: "var(--app-surface3)", border: "1px solid var(--app-border)", color: "var(--app-text1)" }}
              />
              <button onClick={handleCreateWatchlist} className="text-[11px] font-medium" style={{ color: "var(--app-teal)" }}>Add</button>
              <button onClick={() => setShowNewWl(false)} style={{ color: "var(--app-text3)" }}><X size={12} /></button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto py-1">
            {loading ? (
              <div className="space-y-1 px-3 py-2">
                {[1, 2, 3].map(i => <div key={i} className="h-8 rounded animate-pulse" style={{ background: "var(--app-surface3)" }} />)}
              </div>
            ) : watchlists.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12px]" style={{ color: "var(--app-text3)" }}>No watchlists yet</div>
            ) : (
              watchlists.map(wl => {
                const active = activeId === wl.id;
                return (
                  <div key={wl.id} className="group relative flex items-center">
                    <button onClick={() => setActiveId(wl.id)}
                      className="flex-1 text-left px-4 py-2.5 text-[13px] transition-colors"
                      style={{
                        background: active ? "var(--app-teal-dim)" : "transparent",
                        color: active ? "var(--app-teal)" : "var(--app-text2)",
                        fontWeight: active ? 500 : 400,
                      }}>
                      <div className="truncate pr-4">{wl.name}</div>
                      <div className="text-[10px] mt-0.5 opacity-60">{wl.items.length} stocks</div>
                    </button>
                    <button
                      onClick={() => handleDeleteWatchlist(wl.id)}
                      className="absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                      style={{ color: "var(--app-text3)" }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--app-loss)"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--app-text3)"}
                      title="Delete watchlist">
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      )}

      {/* ── Middle: items table ───────────────────────────────────────── */}
      <div className="w-[380px] flex-shrink-0 flex flex-col overflow-hidden" style={surfaceStyle}>
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--app-border)" }}>
          <div>
            <h1 className="text-[15px] font-bold" style={{ color: "var(--app-text1)" }}>
              {activeWl ? activeWl.name : "Watchlist"}
            </h1>
            {activeWl && (
              <div className="text-[11px] mt-0.5" style={{ color: "var(--app-text3)" }}>
                {activeWl.items.length} stock{activeWl.items.length !== 1 ? "s" : ""}
              </div>
            )}
          </div>

          {activeWl && (
            <div className="flex items-center gap-2">
              {addMsg && (
                <span className="text-[11px] font-medium"
                  style={{ color: addMsg === "Added!" ? "var(--app-gain)" : "var(--app-loss)" }}>
                  {addMsg}
                </span>
              )}
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--app-text3)" }} />
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
                  className="text-[12px] rounded-[6px] pl-7 pr-3 py-1.5 outline-none w-[150px]"
                  style={{ background: "var(--app-surface3)", border: "1px solid var(--app-border)", color: "var(--app-text1)" }}
                />
                {showDropdown && searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 rounded-[8px] shadow-lg z-20 mt-0.5 max-h-48 overflow-y-auto"
                    style={{ background: "var(--app-surface2)", border: "1px solid var(--app-border)" }}>
                    {searchResults.map(s => (
                      <div key={s.symbol} onMouseDown={() => handlePickSymbol(s.symbol)}
                        className="px-3 py-2 cursor-pointer transition-colors"
                        style={{ borderBottom: "1px solid var(--app-border2)" }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--app-surface3)"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                        <div className="text-[12px] font-semibold" style={{ color: "var(--app-text1)" }}>{s.symbol}</div>
                        <div className="text-[10px] truncate" style={{ color: "var(--app-text3)" }}>{s.company_name}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={handleAddSymbol} disabled={adding || !symbolInput.trim()}
                className="px-2.5 py-1.5 rounded-[6px] text-[12px] font-medium disabled:opacity-50 transition-opacity"
                style={{ background: "var(--app-teal)", color: "#0D0F14" }}>
                {adding ? "…" : "Add"}
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {!activeWl ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="text-[14px] font-medium mb-1" style={{ color: "var(--app-text1)" }}>No watchlist selected</div>
              <div className="text-[12px]" style={{ color: "var(--app-text3)" }}>Create or select a watchlist from the sidebar.</div>
            </div>
          ) : activeWl.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="text-[14px] font-medium mb-1" style={{ color: "var(--app-text1)" }}>This watchlist is empty</div>
              <div className="text-[12px]" style={{ color: "var(--app-text3)" }}>Type a symbol above and press Enter to add stocks.</div>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={activeWl.items.map(i => i.symbol)} strategy={verticalListSortingStrategy}>
                <table className="w-full border-collapse text-[12px]">
                  <thead className="sticky top-0 z-10"
                    style={{ background: "var(--app-surface)", borderBottom: "1px solid var(--app-border)" }}>
                    <tr>
                      <th className="px-3 py-2.5 w-8" />
                      {["Symbol","Close","Chg%","Vol×","RSI"].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.4px]"
                          style={{ color: "var(--app-text3)" }}>{h}</th>
                      ))}
                      <th className="px-3 py-2.5 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {activeWl.items.map(item => (
                      <SortableRow
                        key={item.symbol}
                        item={item}
                        isHovered={hoveredSymbol === item.symbol}
                        onRemove={handleRemove}
                        onHover={handleRowHover}
                      />
                    ))}
                  </tbody>
                </table>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      {/* ── Right: chart + order panel ───────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-hidden" style={{ background: "var(--app-surface)" }}>
        {chartSymbol ? (
          <ChartPanel key={chartSymbol} symbol={chartSymbol}
            latestClose={activeWl?.items.find(i => i.symbol === chartSymbol)?.close} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
              style={{ background: "var(--app-surface3)" }}>
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                <polyline points="3,17 9,11 13,15 21,7" stroke="var(--app-text3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-[13px] font-medium" style={{ color: "var(--app-text3)" }}>Hover over a stock to see its chart</p>
          </div>
        )}
      </div>
    </div>
  );
}
