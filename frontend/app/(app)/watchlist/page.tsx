"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
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
import { EmptyState } from "@/components/ui";

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

  return (
    <tr
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        borderBottom: "1px solid var(--border-subtle)",
        background: isHovered ? "var(--accent-subtle)" : "transparent",
        borderLeft: `2px solid ${isHovered ? "var(--accent)" : "transparent"}`,
        cursor: "default",
      }}
      onMouseEnter={() => onHover(item.symbol)}
      onMouseLeave={() => onHover(null)}
    >
      <td style={{ padding: "8px 10px 8px 8px", width: 28 }} onClick={e => e.stopPropagation()}>
        <button
          {...attributes}
          {...listeners}
          style={{ color: "var(--text-tertiary)", cursor: "grab", lineHeight: 0 }}
        >
          <GripVertical size={13} />
        </button>
      </td>
      <td style={{ padding: "8px 10px" }}>
        <div className="mono" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{item.symbol}</div>
        {item.company_name && (
          <div className="caption" style={{ maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.company_name}
          </div>
        )}
      </td>
      <td style={{ padding: "8px 10px", textAlign: "right" }}>
        <div className="mono" style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>
          {item.close != null ? `₹${item.close.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}
        </div>
        <div className="mono" style={{
          fontSize: 11, fontWeight: 600,
          color: (item.pct_change ?? 0) >= 0 ? "var(--gain)" : "var(--loss)",
        }}>
          {item.pct_change != null ? `${item.pct_change >= 0 ? "+" : ""}${item.pct_change.toFixed(2)}%` : "—"}
        </div>
      </td>
      <td style={{ padding: "8px 6px", textAlign: "right" }}>
        <div className="mono" style={{ fontSize: 11, color: "var(--accent)" }}>
          {item.volume_ratio != null ? `${item.volume_ratio.toFixed(2)}×` : "—"}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
          {item.rsi_14 != null ? `RSI ${item.rsi_14.toFixed(0)}` : ""}
        </div>
      </td>
      <td style={{ padding: "8px 8px 8px 4px", textAlign: "right", width: 28 }} onClick={e => e.stopPropagation()}>
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

function ChartPanel({ symbol, latestClose }: { symbol: string; latestClose?: number | null }) {
  const [candles, setCandles] = useState<CandleBar[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState(false);
  const [tf, setTf] = useState("3M");

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [orderBusy, setOrderBusy] = useState(false);
  const [orderMsg, setOrderMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setChartLoading(true);
    setChartError(false);
    setCandles([]);
    getCandles(symbol, { limit: 120 })
      .then(d => {
        setCandles(d.candles);
        if (d.latest?.close && !price) setPrice(String(d.latest.close));
      })
      .catch(() => setChartError(true))
      .finally(() => setChartLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

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

  const inputStyle: React.CSSProperties = {
    width: "100%", fontSize: 12, borderRadius: "var(--radius-sm)", padding: "5px 8px",
    background: "var(--surface-3)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)",
    outline: "none",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Topbar */}
      <div style={{
        height: 44, padding: "0 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid var(--border-subtle)",
        background: "var(--surface-1)", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span className="mono" style={{ fontSize: 15, fontWeight: 600 }}>{symbol}</span>
          <span className="caption">Daily · EMA 20/50/200</span>
        </div>
        <TimeframeTabs active={tf} onChange={setTf} />
      </div>

      {/* Chart */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
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
      <div style={{ flexShrink: 0, padding: "12px 16px", borderTop: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}>
        <div className="label" style={{ marginBottom: 10 }}>Quick order</div>

        {/* Buy / Sell */}
        <div style={{ display: "flex", borderRadius: "var(--radius-sm)", overflow: "hidden", border: "1px solid var(--border-subtle)", marginBottom: 10 }}>
          {(["buy", "sell"] as const).map(s => (
            <button key={s} onClick={() => setSide(s)}
              style={{
                flex: 1, padding: "6px 0", fontSize: 12, fontWeight: 600, cursor: "pointer",
                background: side === s ? (s === "buy" ? "var(--gain)" : "var(--loss)") : "transparent",
                color: side === s ? "#fff" : "var(--text-tertiary)",
                border: "none", textTransform: "capitalize",
                transition: "all var(--motion-instant) var(--ease-out)",
              }}>
              {s === "buy" ? "Buy" : "Sell"}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <div>
            <div className="label" style={{ marginBottom: 4 }}>Type</div>
            <select value={orderType} onChange={e => setOrderType(e.target.value as "market" | "limit")} style={inputStyle}>
              <option value="market">Market</option>
              <option value="limit">Limit</option>
            </select>
          </div>
          <div>
            <div className="label" style={{ marginBottom: 4 }}>Qty</div>
            <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div style={{ marginBottom: 8 }}>
          <div className="label" style={{ marginBottom: 4 }}>Price (₹)</div>
          <input type="number" step="0.05" min="0" value={price} onChange={e => setPrice(e.target.value)} style={inputStyle} />
        </div>

        {orderMsg && (
          <div style={{ fontSize: 11, marginBottom: 8, fontWeight: 500, color: orderMsg.ok ? "var(--gain)" : "var(--loss)" }}>
            {orderMsg.text}
          </div>
        )}

        <button onClick={handleOrder} disabled={orderBusy}
          style={{
            width: "100%", padding: "7px 0", borderRadius: "var(--radius-sm)", border: "none",
            background: side === "buy" ? "var(--gain)" : "var(--loss)", color: "#fff",
            fontSize: 12, fontWeight: 600, cursor: orderBusy ? "not-allowed" : "pointer",
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

  const [hoveredSymbol, setHoveredSymbol] = useState<string | null>(null);
  const [chartSymbol, setChartSymbol] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const symbolParam = searchParams.get("symbol");
  useEffect(() => {
    if (!symbolParam || watchlists.length === 0) return;
    let found = false;
    for (const wl of watchlists) {
      if (wl.items?.some((i: WatchlistItem) => i.symbol === symbolParam)) {
        setActiveId(wl.id);
        setChartSymbol(symbolParam);
        setHoveredSymbol(symbolParam);
        found = true;
        break;
      }
    }
    if (!found && activeId) {
      addToWatchlist(activeId, symbolParam)
        .then(() => getQuote(symbolParam))
        .then(quote => {
          const newItem: WatchlistItem = quote
            ? { symbol: quote.symbol, sort_order: 0, added_at: new Date().toISOString(), company_name: quote.company_name, sector: quote.sector, close: quote.close, pct_change: quote.pct_change, volume_ratio: quote.volume_ratio, rsi_14: quote.rsi_14 }
            : { symbol: symbolParam, sort_order: 0, added_at: new Date().toISOString() };
          setWatchlists(prev => prev.map(w => w.id === activeId ? { ...w, items: [...(w.items || []), newItem] } : w));
          setChartSymbol(symbolParam);
          setHoveredSymbol(symbolParam);
        })
        .catch(() => {});
    }
    router.replace("/watchlist", { scroll: false });
  }, [symbolParam, watchlists.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
    try {
      await addToWatchlist(activeId, sym);
      const quote = await getQuote(sym);
      const newItem: WatchlistItem = quote
        ? { symbol: quote.symbol, sort_order: 0, added_at: new Date().toISOString(), company_name: quote.company_name, sector: quote.sector, close: quote.close, pct_change: quote.pct_change, volume_ratio: quote.volume_ratio, rsi_14: quote.rsi_14 }
        : { symbol: sym, sort_order: 0, added_at: new Date().toISOString() };
      setWatchlists(prev => prev.map(w => w.id === activeId ? { ...w, items: [...w.items, newItem] } : w));
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

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", background: "var(--surface-0)" }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 64, left: "50%", transform: "translateX(-50%)", zIndex: 50, fontSize: 13, padding: "8px 16px", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-dropdown)", background: "var(--surface-float)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}>
          {toast}
        </div>
      )}

      {/* ── Watchlist tabs sidebar ─── */}
      {sidebarCollapsed ? (
        <div style={{ width: 36, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 12, background: "var(--surface-1)", borderRight: "1px solid var(--border-subtle)" }}>
          <button onClick={() => setSidebarCollapsed(false)} style={{ color: "var(--text-tertiary)" }}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
              <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      ) : (
        <aside style={{ width: 200, flexShrink: 0, display: "flex", flexDirection: "column", height: "100%", background: "var(--surface-1)", borderRight: "1px solid var(--border-subtle)" }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
              <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 12, color: "var(--text-tertiary)" }}>No watchlists yet</div>
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
      <div style={{ width: 260, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--surface-1)", borderRight: "1px solid var(--border-subtle)" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
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
                style={{ padding: "5px 8px", borderRadius: "var(--radius-sm)", fontSize: 11, fontWeight: 500, background: "var(--accent)", color: "#0A1712", cursor: "pointer", opacity: (adding || !symbolInput.trim()) ? 0.5 : 1 }}>
                {adding ? "…" : "Add"}
              </button>
            </div>
          )}
        </div>

        {/* Stock rows */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {!activeWl ? (
            <EmptyState title="No watchlist selected" description="Create or select a watchlist from the sidebar." />
          ) : activeWl.items.length === 0 ? (
            <EmptyState
              title="No stocks yet"
              description="Add stocks from the Scanner, or type a symbol above."
              action={{ label: "Go to scanner", href: "/scanner" }}
            />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={activeWl.items.map(i => i.symbol)} strategy={verticalListSortingStrategy}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--surface-1)", borderBottom: "1px solid var(--border-subtle)" }}>
                    <tr>
                      <th style={{ width: 28 }} />
                      <th className="label" style={{ padding: "8px 10px", textAlign: "left" }}>Symbol</th>
                      <th className="label" style={{ padding: "8px 10px", textAlign: "right" }}>Price / Chg</th>
                      <th className="label" style={{ padding: "8px 6px", textAlign: "right" }}>Vol / RSI</th>
                      <th style={{ width: 28 }} />
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

      {/* ── Chart + order panel ─────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, overflow: "hidden", background: "var(--surface-1)" }}>
        {chartSymbol ? (
          <ChartPanel key={chartSymbol} symbol={chartSymbol}
            latestClose={activeWl?.items.find(i => i.symbol === chartSymbol)?.close} />
        ) : (
          <div style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <EmptyState
              title="Hover any stock to see its chart"
              description="EMA 20, 50, and 200 are overlaid automatically."
            />
          </div>
        )}
      </div>

      <style>{`
        .wl-item:hover .wl-delete { opacity: 1 !important; }
        tr:hover .remove-btn { opacity: 1 !important; }
      `}</style>
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
