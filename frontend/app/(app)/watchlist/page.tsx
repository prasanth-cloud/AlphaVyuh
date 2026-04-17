"use client";

import { useState, useEffect, useCallback } from "react";
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
import { useRouter } from "next/navigation";
import type { Watchlist, WatchlistItem } from "@/lib/api";
import {
  getWatchlists,
  createWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  reorderWatchlist,
  getQuote,
  searchSymbols,
} from "@/lib/api";
import type { SymbolSearchResult } from "@/lib/api";
import RsiBadge from "@/components/scanner/RsiBadge";
import PctChange from "@/components/scanner/PctChange";

// ─── Sortable row ─────────────────────────────────────────────────────────────

function SortableRow({
  item,
  onRemove,
}: {
  item: WatchlistItem;
  onRemove: (symbol: string) => void;
}) {
  const router = useRouter();
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
      style={style}
      onClick={() => router.push(`/charts/${item.symbol}`)}
      className="border-b border-[#f7f7f5] group bg-white hover:bg-[#f7f7f5] transition-colors cursor-pointer"
    >
      <td className="px-3 py-3 w-8" onClick={e => e.stopPropagation()}>
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab text-[#ccc] hover:text-[#888] touch-none"
        >
          <GripVertical size={14} />
        </button>
      </td>
      <td className="px-3 py-3">
        <div className="text-[13px] font-semibold text-[#1c1c1a]">{item.symbol}</div>
        {item.company_name && (
          <div className="text-[10px] text-[#aaa] truncate max-w-[140px]">{item.company_name}</div>
        )}
      </td>
      <td className="px-3 py-3 tabular-nums text-[12px] text-[#1c1c1a] font-medium">
        {item.close != null
          ? `₹${item.close.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
          : "—"}
      </td>
      <td className="px-3 py-3">
        <PctChange pct={item.pct_change ?? null} />
      </td>
      <td className="px-3 py-3 tabular-nums text-[12px]" style={{ color: "#7c6af0" }}>
        {item.volume_ratio != null ? `${item.volume_ratio.toFixed(2)}x` : "—"}
      </td>
      <td className="px-3 py-3">
        <RsiBadge rsi={item.rsi_14 ?? null} />
      </td>
      <td className="px-3 py-3 text-right" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-2">
          <span className="opacity-0 group-hover:opacity-100 text-[11px] text-[#5b63f5] font-medium transition-opacity whitespace-nowrap">
            View chart →
          </span>
          <button
            onClick={() => onRemove(item.symbol)}
            className="opacity-0 group-hover:opacity-100 text-[#ccc] hover:text-[#e5383b] transition-opacity"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </td>
    </tr>
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

  const activeWl = watchlists.find(w => w.id === activeId) ?? null;

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
      // Fetch only this stock's quote and append optimistically
      const quote = await getQuote(sym);
      const newItem: WatchlistItem = quote
        ? {
            symbol: quote.symbol,
            sort_order: 0,
            added_at: new Date().toISOString(),
            company_name: quote.company_name,
            sector: quote.sector,
            close: quote.close,
            pct_change: quote.pct_change,
            volume_ratio: quote.volume_ratio,
            rsi_14: quote.rsi_14,
          }
        : { symbol: sym, sort_order: 0, added_at: new Date().toISOString() };
      setWatchlists(prev =>
        prev.map(w =>
          w.id === activeId ? { ...w, items: [...w.items, newItem] } : w
        )
      );
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
      prev.map(w =>
        w.id === activeId ? { ...w, items: w.items.filter(i => i.symbol !== symbol) } : w
      )
    );
  }

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !activeId) return;

      setWatchlists(prev =>
        prev.map(w => {
          if (w.id !== activeId) return w;
          const oldIdx = w.items.findIndex(i => i.symbol === active.id);
          const newIdx = w.items.findIndex(i => i.symbol === over.id);
          const reordered = arrayMove(w.items, oldIdx, newIdx).map((item, idx) => ({
            ...item,
            sort_order: idx,
          }));
          // Persist asynchronously
          reorderWatchlist(
            activeId,
            reordered.map(i => ({ symbol: i.symbol, sort_order: i.sort_order }))
          );
          return { ...w, items: reordered };
        })
      );
    },
    [activeId]
  );

  return (
    <div className="flex h-full bg-[#f2f2f0] overflow-hidden">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#1c1c1a] text-white text-[13px] px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
      {/* ── Left sidebar: watchlist list ─────────────────────────────── */}
      <aside className="w-[220px] flex-shrink-0 bg-white border-r border-[#e2e2df] flex flex-col h-full">
        <div className="px-4 py-3.5 border-b border-[#f0f0ee] flex items-center justify-between">
          <span className="text-[13px] font-bold text-[#1c1c1a]">Watchlists</span>
          <button
            onClick={() => setShowNewWl(o => !o)}
            className="text-[#5b63f5] hover:opacity-70"
          >
            <Plus size={15} />
          </button>
        </div>

        {showNewWl && (
          <div className="px-4 py-2.5 border-b border-[#f0f0ee] flex gap-1.5">
            <input
              autoFocus
              value={newWlName}
              onChange={e => setNewWlName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreateWatchlist()}
              placeholder="List name…"
              className="flex-1 text-[11px] border border-[#e2e2df] rounded-[4px] px-2 py-1 outline-none focus:border-[#5b63f5]"
            />
            <button onClick={handleCreateWatchlist} className="text-[11px] text-[#5b63f5] font-medium">
              Add
            </button>
            <button onClick={() => setShowNewWl(false)} className="text-[#aaa]">
              <X size={12} />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-1">
          {loading ? (
            <div className="space-y-1 px-3 py-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-8 rounded bg-[#f0f0ee] animate-pulse" />
              ))}
            </div>
          ) : watchlists.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] text-[#aaa]">
              No watchlists yet
            </div>
          ) : (
            watchlists.map(wl => (
              <button
                key={wl.id}
                onClick={() => setActiveId(wl.id)}
                className={`w-full text-left px-4 py-2.5 text-[13px] transition-colors ${
                  activeId === wl.id
                    ? "bg-[#eeeffe] text-[#5b63f5] font-medium"
                    : "text-[#444] hover:bg-[#f7f7f5]"
                }`}
              >
                <div className="truncate">{wl.name}</div>
                <div className="text-[10px] mt-0.5 opacity-60">{wl.items.length} stocks</div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ── Right panel: items table ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#e2e2df] bg-white flex-shrink-0">
          <div>
            <h1 className="text-[16px] font-bold text-[#1c1c1a]">
              {activeWl ? activeWl.name : "Watchlist"}
            </h1>
            {activeWl && (
              <div className="text-[11px] text-[#aaa] mt-0.5">
                {activeWl.items.length} stock{activeWl.items.length !== 1 ? "s" : ""}
              </div>
            )}
          </div>

          {/* Add symbol input */}
          {activeWl && (
            <div className="flex items-center gap-2">
              {addMsg && (
                <span
                  className={`text-[11px] font-medium ${
                    addMsg === "Added!" ? "text-[#26a65b]" : "text-[#e5383b]"
                  }`}
                >
                  {addMsg}
                </span>
              )}
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#aaa]" />
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
                  className="text-[12px] border border-[#e2e2df] rounded-[6px] pl-7 pr-3 py-1.5 outline-none focus:border-[#5b63f5] w-[180px]"
                />
                {showDropdown && searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-[#e2e2df] rounded-[8px] shadow-md z-20 mt-0.5 max-h-48 overflow-y-auto">
                    {searchResults.map(s => (
                      <div
                        key={s.symbol}
                        onMouseDown={() => handlePickSymbol(s.symbol)}
                        className="px-3 py-2 hover:bg-[#f7f7f5] cursor-pointer"
                      >
                        <div className="text-[12px] font-semibold text-[#1c1c1a]">{s.symbol}</div>
                        <div className="text-[10px] text-[#aaa] truncate">{s.company_name}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={handleAddSymbol}
                disabled={adding || !symbolInput.trim()}
                className="px-3 py-1.5 rounded-[6px] bg-[#1c1c1a] text-white text-[12px] font-medium hover:opacity-85 disabled:opacity-50 transition-opacity"
              >
                {adding ? "Adding…" : "Add"}
              </button>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto bg-white">
          {!activeWl ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="text-[14px] font-medium text-[#1c1c1a] mb-1">No watchlist selected</div>
              <div className="text-[12px] text-[#aaa]">Create or select a watchlist from the sidebar.</div>
            </div>
          ) : activeWl.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="text-[14px] font-medium text-[#1c1c1a] mb-1">This watchlist is empty</div>
              <div className="text-[12px] text-[#aaa]">
                Type a symbol above and press Enter to add your first stock.
              </div>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={activeWl.items.map(i => i.symbol)}
                strategy={verticalListSortingStrategy}
              >
                <table className="w-full border-collapse text-[12px]">
                  <thead className="sticky top-0 bg-white border-b border-[#e2e2df] z-10">
                    <tr>
                      <th className="px-3 py-2.5 w-8" />
                      <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.4px] text-[#888]">
                        Symbol
                      </th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.4px] text-[#888]">
                        Close
                      </th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.4px] text-[#888]">
                        Change
                      </th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.4px] text-[#888]">
                        Vol Ratio
                      </th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.4px] text-[#888]">
                        RSI
                      </th>
                      <th className="px-3 py-2.5 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {activeWl.items.map(item => (
                      <SortableRow key={item.symbol} item={item} onRemove={handleRemove} />
                    ))}
                  </tbody>
                </table>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>
    </div>
  );
}
