"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  getJournalEntries,
  getJournalStats,
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  searchSymbols,
} from "@/lib/api";
import type { JournalEntry, JournalStats, CreateJournalEntry, UpdateJournalEntry, SymbolSearchResult } from "@/lib/api";

// ── Nav ───────────────────────────────────────────────────────────────────────

function NavLink({ href, label, active }: { href: string; label: string; active?: boolean }) {
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 text-[13px] rounded-md transition-colors ${
        active ? "bg-[#f2f2f0] text-[#1c1c1a] font-medium" : "text-[#888] hover:bg-[#f7f7f5] hover:text-[#1c1c1a]"
      }`}
    >
      {label}
    </Link>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCcy(v: number | null | undefined) {
  if (v == null) return "—";
  const abs = Math.abs(v);
  const str = abs >= 100000
    ? `₹${(abs / 100000).toFixed(2)}L`
    : `₹${abs.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  return v >= 0 ? str : `-${str}`;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

function PnlChip({ pnl }: { pnl: number | null }) {
  if (pnl == null) return <span className="text-[#aaa] text-[12px]">Open</span>;
  const pos = pnl >= 0;
  return (
    <span
      className="text-[12px] font-medium px-1.5 py-0.5 rounded-md"
      style={{ color: pos ? "#26a65b" : "#e5383b", background: pos ? "#edfaf3" : "#fff0f0" }}
    >
      {pos ? "+" : ""}{fmtCcy(pnl)}
    </span>
  );
}

function StatusBadge({ status, pnl }: { status: string; pnl: number | null }) {
  if (status === "open") {
    return <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-[#eeeffe] text-[#5b63f5]">Open</span>;
  }
  if (status === "closed" && pnl != null) {
    const win = pnl >= 0;
    return (
      <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full"
        style={{ background: win ? "#edfaf3" : "#fff0f0", color: win ? "#26a65b" : "#e5383b" }}>
        {win ? "Win" : "Loss"}
      </span>
    );
  }
  return <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{status}</span>;
}

// ── Setup type chips ──────────────────────────────────────────────────────────

const SETUP_TYPES = ["Breakout", "Pullback", "Reversal", "Momentum", "Other"];

// ── Main page ─────────────────────────────────────────────────────────────────

type PanelMode = "add" | "close" | "view" | null;

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [stats, setStats] = useState<JournalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "closed">("all");
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  // Symbol search
  const [symbolQ, setSymbolQ] = useState("");
  const [symbolResults, setSymbolResults] = useState<SymbolSearchResult[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState("");

  // Add form
  const [addForm, setAddForm] = useState<Partial<CreateJournalEntry>>({
    trade_type: "long",
    entry_date: new Date().toISOString().split("T")[0],
  });

  // Close form
  const [closeForm, setCloseForm] = useState<Partial<UpdateJournalEntry>>({
    exit_date: new Date().toISOString().split("T")[0],
  });

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = filterStatus === "all" ? {} : { status: filterStatus };
      const [e, s] = await Promise.all([getJournalEntries(params), getJournalStats()]);
      setEntries(e.entries);
      setStats(s);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { load(); }, [load]);

  // Symbol autocomplete
  useEffect(() => {
    if (symbolQ.length < 1) { setSymbolResults([]); return; }
    const t = setTimeout(async () => {
      const r = await searchSymbols(symbolQ);
      setSymbolResults(r.slice(0, 6));
    }, 250);
    return () => clearTimeout(t);
  }, [symbolQ]);

  // Computed values for add form
  const tradeValue = addForm.entry_price && addForm.quantity
    ? addForm.entry_price * addForm.quantity : null;
  const riskRupees = addForm.entry_price && addForm.stop_loss && addForm.quantity
    ? Math.abs(addForm.entry_price - addForm.stop_loss) * addForm.quantity : null;
  const rrRatio = addForm.entry_price && addForm.stop_loss && addForm.target_price
    ? (() => {
        const risk = addForm.trade_type === "long"
          ? addForm.entry_price - addForm.stop_loss
          : addForm.stop_loss - addForm.entry_price;
        const reward = addForm.trade_type === "long"
          ? addForm.target_price - addForm.entry_price
          : addForm.entry_price - addForm.target_price;
        return risk > 0 ? (reward / risk).toFixed(2) : null;
      })()
    : null;

  // P&L preview for close form
  const pnlPreview = selectedEntry && closeForm.exit_price
    ? (() => {
        const ep = selectedEntry.entry_price;
        const xp = closeForm.exit_price;
        const qty = selectedEntry.quantity;
        return selectedEntry.trade_type === "long"
          ? (xp - ep) * qty
          : (ep - xp) * qty;
      })()
    : null;

  const handleAddTrade = async () => {
    if (!selectedSymbol || !addForm.entry_price || !addForm.quantity || !addForm.entry_date || !addForm.trade_type) {
      showToast("Fill in symbol, date, price and quantity");
      return;
    }
    setSaving(true);
    try {
      await createJournalEntry({ ...addForm, symbol: selectedSymbol } as CreateJournalEntry);
      setAddForm({ trade_type: "long", entry_date: new Date().toISOString().split("T")[0] });
      setSelectedSymbol("");
      setSymbolQ("");
      setPanelMode(null);
      showToast("Trade logged");
      load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleCloseTrade = async () => {
    if (!selectedEntry || !closeForm.exit_price || !closeForm.exit_date) {
      showToast("Fill exit date and price");
      return;
    }
    setSaving(true);
    try {
      await updateJournalEntry(selectedEntry.id, closeForm as UpdateJournalEntry);
      setPanelMode(null);
      setSelectedEntry(null);
      showToast("Trade closed");
      load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Failed to close");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this trade?")) return;
    await deleteJournalEntry(id);
    if (selectedEntry?.id === id) { setSelectedEntry(null); setPanelMode(null); }
    showToast("Deleted");
    load();
  };

  const openClosePanel = (e: JournalEntry) => {
    setSelectedEntry(e);
    setCloseForm({ exit_date: new Date().toISOString().split("T")[0] });
    setPanelMode("close");
  };

  const openAddPanel = () => {
    setSelectedEntry(null);
    setAddForm({ trade_type: "long", entry_date: new Date().toISOString().split("T")[0] });
    setSelectedSymbol("");
    setSymbolQ("");
    setPanelMode("add");
  };

  return (
    <div className="min-h-screen bg-[#f2f2f0]">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#1c1c1a] text-white text-[13px] px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {/* Nav */}
      <nav className="h-[50px] bg-white border-b border-[#e2e2df] flex items-center px-5 gap-0">
        <div className="flex items-center gap-2 mr-8">
          <div className="w-7 h-7 bg-[#1c1c1a] rounded-[7px] flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 11L7 3L12 11" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4.5 8h5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <span className="text-[15px] font-semibold text-[#1c1c1a] tracking-tight">
            Alpha<span className="text-[#5b63f5]">Vyuh</span>
          </span>
        </div>
        <div className="flex gap-0.5">
          <NavLink href="/dashboard" label="Dashboard" />
          <NavLink href="/scanner" label="Scanner" />
          <NavLink href="/watchlist" label="Watchlist" />
          <NavLink href="/charts/RELIANCE" label="Charts" />
          <NavLink href="/journal" label="Journal" active />
        </div>
      </nav>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2.5 px-5 pt-4">
        {[
          {
            label: "Total P&L",
            val: stats ? fmtCcy(stats.total_pnl) : "—",
            color: stats ? (stats.total_pnl >= 0 ? "#26a65b" : "#e5383b") : "#1c1c1a",
          },
          {
            label: "Win Rate",
            val: stats ? `${stats.win_rate}%` : "—",
            color: stats ? (stats.win_rate >= 50 ? "#26a65b" : "#e5383b") : "#1c1c1a",
          },
          {
            label: "Closed Trades",
            val: stats?.total_trades ?? "—",
            color: "#1c1c1a",
          },
          {
            label: "Open Trades",
            val: stats?.open_trades ?? "—",
            color: "#5b63f5",
          },
        ].map((item) => (
          <div key={item.label} className="bg-white border border-[#e2e2df] rounded-[10px] px-4 py-3.5">
            <div className="text-[22px] font-bold tracking-tight leading-none" style={{ color: item.color }}>
              {item.val}
            </div>
            <div className="text-[10px] text-[#aaa] uppercase tracking-wider mt-1">{item.label}</div>
          </div>
        ))}
      </div>

      {/* Body */}
      <div className="flex gap-2.5 px-5 pt-3 pb-5">
        {/* Trade list */}
        <div className="flex-1 min-w-0">
          {/* Toolbar */}
          <div className="flex items-center gap-2 mb-2.5">
            <div className="flex bg-white border border-[#e2e2df] rounded-[8px] p-0.5 gap-0.5">
              {(["all", "open", "closed"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`px-3 py-1 text-[12px] rounded-[6px] capitalize transition-colors ${
                    filterStatus === s ? "bg-[#1c1c1a] text-white" : "text-[#888] hover:text-[#1c1c1a]"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            <button
              onClick={openAddPanel}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1c1c1a] text-white text-[13px] font-medium rounded-[8px] hover:bg-[#333] transition-colors"
            >
              <span className="text-[16px] leading-none">+</span> Log trade
            </button>
          </div>

          {/* Table */}
          <div className="bg-white border border-[#e2e2df] rounded-[10px] overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[#f0f0ee]">
                  {["Symbol", "Type", "Entry", "Entry px", "Exit px", "P&L", "Status", ""].map((h) => (
                    <th key={h} className="text-left px-3 py-2.5 text-[11px] font-medium text-[#aaa] uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-[#f7f7f5]">
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j} className="px-3 py-3">
                          <div className="h-4 bg-gray-100 rounded animate-pulse w-16" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : entries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-12 text-center">
                      <div className="text-[13px] text-[#aaa]">No trades yet.</div>
                      <button
                        onClick={openAddPanel}
                        className="mt-2 text-[13px] text-[#5b63f5] hover:underline"
                      >
                        Log your first trade →
                      </button>
                    </td>
                  </tr>
                ) : (
                  entries.map((e) => (
                    <tr
                      key={e.id}
                      onClick={() => { setSelectedEntry(e); setPanelMode("view"); }}
                      className={`border-b border-[#f7f7f5] cursor-pointer transition-colors ${
                        selectedEntry?.id === e.id ? "bg-[#f7f7fe]" : "hover:bg-[#fafafa]"
                      }`}
                    >
                      <td className="px-3 py-2.5">
                        <span className="font-medium text-[#1c1c1a]">{e.symbol}</span>
                        {e.setup_type && (
                          <span className="ml-1.5 text-[10px] text-[#aaa]">{e.setup_type}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className="text-[11px] font-bold uppercase px-1.5 py-0.5 rounded"
                          style={{
                            color: e.trade_type === "long" ? "#26a65b" : "#e5383b",
                            background: e.trade_type === "long" ? "#edfaf3" : "#fff0f0",
                          }}
                        >
                          {e.trade_type === "long" ? "L" : "S"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[#888]">{fmtDate(e.entry_date)}</td>
                      <td className="px-3 py-2.5 font-medium">₹{e.entry_price.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-2.5 text-[#888]">
                        {e.exit_price ? `₹${e.exit_price.toLocaleString("en-IN")}` : "—"}
                      </td>
                      <td className="px-3 py-2.5"><PnlChip pnl={e.pnl} /></td>
                      <td className="px-3 py-2.5"><StatusBadge status={e.status} pnl={e.pnl} /></td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1.5" onClick={(ev) => ev.stopPropagation()}>
                          {e.status === "open" && (
                            <button
                              onClick={() => openClosePanel(e)}
                              className="text-[11px] text-[#5b63f5] hover:underline"
                            >
                              Close
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(e.id)}
                            className="text-[11px] text-[#ccc] hover:text-[#e5383b]"
                          >
                            ×
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Side panel */}
        {panelMode && (
          <div className="w-[340px] flex-shrink-0">
            <div className="bg-white border border-[#e2e2df] rounded-[10px] p-5">
              {/* Panel header */}
              <div className="flex items-center justify-between mb-4">
                <div className="text-[14px] font-semibold text-[#1c1c1a]">
                  {panelMode === "add" ? "Log Trade" : panelMode === "close" ? `Close ${selectedEntry?.symbol}` : selectedEntry?.symbol}
                </div>
                <button onClick={() => { setPanelMode(null); setSelectedEntry(null); }} className="text-[#ccc] hover:text-[#888] text-[18px] leading-none">×</button>
              </div>

              {/* ── ADD FORM ── */}
              {panelMode === "add" && (
                <div className="space-y-3">
                  {/* Symbol search */}
                  <div className="relative">
                    <label className="text-[11px] text-[#aaa] uppercase tracking-wider mb-1 block">Symbol</label>
                    <input
                      value={selectedSymbol || symbolQ}
                      onChange={(ev) => {
                        setSelectedSymbol("");
                        setSymbolQ(ev.target.value.toUpperCase());
                      }}
                      placeholder="e.g. RELIANCE"
                      className="w-full border border-[#e2e2df] rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#5b63f5]"
                    />
                    {symbolResults.length > 0 && !selectedSymbol && (
                      <div className="absolute top-full left-0 right-0 bg-white border border-[#e2e2df] rounded-[8px] shadow-lg z-20 overflow-hidden mt-0.5">
                        {symbolResults.map((r) => (
                          <button
                            key={r.symbol}
                            onClick={() => {
                              setSelectedSymbol(r.symbol);
                              setSymbolQ(r.symbol);
                              setSymbolResults([]);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-[#f7f7f5] text-[13px]"
                          >
                            <span className="font-medium">{r.symbol}</span>
                            <span className="text-[#aaa] ml-2 text-[11px]">{r.company_name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Long / Short */}
                  <div>
                    <label className="text-[11px] text-[#aaa] uppercase tracking-wider mb-1 block">Direction</label>
                    <div className="flex gap-2">
                      {(["long", "short"] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => setAddForm((f) => ({ ...f, trade_type: t }))}
                          className="flex-1 py-2 rounded-[8px] text-[13px] font-medium border transition-colors capitalize"
                          style={addForm.trade_type === t
                            ? { background: t === "long" ? "#edfaf3" : "#fff0f0", color: t === "long" ? "#26a65b" : "#e5383b", borderColor: t === "long" ? "#26a65b" : "#e5383b" }
                            : { background: "white", color: "#aaa", borderColor: "#e2e2df" }
                          }
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Entry date */}
                  <div>
                    <label className="text-[11px] text-[#aaa] uppercase tracking-wider mb-1 block">Entry Date</label>
                    <input
                      type="date"
                      value={addForm.entry_date || ""}
                      onChange={(ev) => setAddForm((f) => ({ ...f, entry_date: ev.target.value }))}
                      className="w-full border border-[#e2e2df] rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#5b63f5]"
                    />
                  </div>

                  {/* Price + Qty */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-[#aaa] uppercase tracking-wider mb-1 block">Entry Price ₹</label>
                      <input
                        type="number"
                        value={addForm.entry_price || ""}
                        onChange={(ev) => setAddForm((f) => ({ ...f, entry_price: parseFloat(ev.target.value) || undefined }))}
                        placeholder="0.00"
                        className="w-full border border-[#e2e2df] rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#5b63f5]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-[#aaa] uppercase tracking-wider mb-1 block">Quantity</label>
                      <input
                        type="number"
                        value={addForm.quantity || ""}
                        onChange={(ev) => setAddForm((f) => ({ ...f, quantity: parseInt(ev.target.value) || undefined }))}
                        placeholder="0"
                        className="w-full border border-[#e2e2df] rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#5b63f5]"
                      />
                    </div>
                  </div>
                  {tradeValue && (
                    <div className="text-[11px] text-[#aaa]">
                      Trade value: ₹{tradeValue.toLocaleString("en-IN")}
                    </div>
                  )}

                  {/* Stop + Target */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-[#aaa] uppercase tracking-wider mb-1 block">Stop Loss ₹</label>
                      <input
                        type="number"
                        value={addForm.stop_loss || ""}
                        onChange={(ev) => setAddForm((f) => ({ ...f, stop_loss: parseFloat(ev.target.value) || undefined }))}
                        placeholder="optional"
                        className="w-full border border-[#e2e2df] rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#5b63f5]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-[#aaa] uppercase tracking-wider mb-1 block">Target ₹</label>
                      <input
                        type="number"
                        value={addForm.target_price || ""}
                        onChange={(ev) => setAddForm((f) => ({ ...f, target_price: parseFloat(ev.target.value) || undefined }))}
                        placeholder="optional"
                        className="w-full border border-[#e2e2df] rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#5b63f5]"
                      />
                    </div>
                  </div>
                  {(riskRupees || rrRatio) && (
                    <div className="text-[11px] text-[#aaa] flex gap-3">
                      {riskRupees && <span>Risk: ₹{riskRupees.toLocaleString("en-IN")}</span>}
                      {rrRatio && <span className="font-medium text-[#5b63f5]">R:R = {rrRatio}</span>}
                    </div>
                  )}

                  {/* Setup type */}
                  <div>
                    <label className="text-[11px] text-[#aaa] uppercase tracking-wider mb-1.5 block">Setup</label>
                    <div className="flex flex-wrap gap-1.5">
                      {SETUP_TYPES.map((s) => (
                        <button
                          key={s}
                          onClick={() => setAddForm((f) => ({ ...f, setup_type: f.setup_type === s.toLowerCase() ? undefined : s.toLowerCase() }))}
                          className="px-2.5 py-1 text-[12px] rounded-full border transition-colors"
                          style={addForm.setup_type === s.toLowerCase()
                            ? { background: "#1c1c1a", color: "white", borderColor: "#1c1c1a" }
                            : { background: "white", color: "#888", borderColor: "#e2e2df" }
                          }
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Entry reason */}
                  <div>
                    <label className="text-[11px] text-[#aaa] uppercase tracking-wider mb-1 block">Why are you entering?</label>
                    <textarea
                      value={addForm.entry_reason || ""}
                      onChange={(ev) => setAddForm((f) => ({ ...f, entry_reason: ev.target.value }))}
                      rows={3}
                      placeholder="EMA alignment, volume surge, breakout of resistance..."
                      className="w-full border border-[#e2e2df] rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#5b63f5] resize-none"
                    />
                  </div>

                  <button
                    onClick={handleAddTrade}
                    disabled={saving}
                    className="w-full py-2.5 bg-[#1c1c1a] text-white text-[13px] font-medium rounded-[8px] hover:bg-[#333] transition-colors disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save Trade"}
                  </button>
                </div>
              )}

              {/* ── CLOSE FORM ── */}
              {panelMode === "close" && selectedEntry && (
                <div className="space-y-3">
                  <div className="text-[12px] text-[#888] pb-2 border-b border-[#f0f0ee]">
                    {selectedEntry.trade_type === "long" ? "Long" : "Short"} · {selectedEntry.quantity} qty · Entered ₹{selectedEntry.entry_price.toLocaleString("en-IN")} on {fmtDate(selectedEntry.entry_date)}
                  </div>

                  <div>
                    <label className="text-[11px] text-[#aaa] uppercase tracking-wider mb-1 block">Exit Date</label>
                    <input
                      type="date"
                      value={closeForm.exit_date || ""}
                      onChange={(ev) => setCloseForm((f) => ({ ...f, exit_date: ev.target.value }))}
                      className="w-full border border-[#e2e2df] rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#5b63f5]"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-[#aaa] uppercase tracking-wider mb-1 block">Exit Price ₹</label>
                    <input
                      type="number"
                      value={closeForm.exit_price || ""}
                      onChange={(ev) => setCloseForm((f) => ({ ...f, exit_price: parseFloat(ev.target.value) || undefined }))}
                      placeholder="0.00"
                      className="w-full border border-[#e2e2df] rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#5b63f5]"
                    />
                  </div>

                  {pnlPreview != null && (
                    <div
                      className="text-[13px] font-semibold px-3 py-2 rounded-[8px]"
                      style={{
                        color: pnlPreview >= 0 ? "#26a65b" : "#e5383b",
                        background: pnlPreview >= 0 ? "#edfaf3" : "#fff0f0",
                      }}
                    >
                      P&L: {pnlPreview >= 0 ? "+" : ""}{fmtCcy(pnlPreview)}
                      {" "}({((pnlPreview / (selectedEntry.entry_price * selectedEntry.quantity)) * 100).toFixed(2)}%)
                    </div>
                  )}

                  <div>
                    <label className="text-[11px] text-[#aaa] uppercase tracking-wider mb-1 block">Why did you exit?</label>
                    <textarea
                      value={closeForm.exit_reason || ""}
                      onChange={(ev) => setCloseForm((f) => ({ ...f, exit_reason: ev.target.value }))}
                      rows={2}
                      placeholder="Target hit, stop loss, chart breakdown..."
                      className="w-full border border-[#e2e2df] rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#5b63f5] resize-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-[#aaa] uppercase tracking-wider mb-1 block">What went wrong?</label>
                    <textarea
                      value={closeForm.mistakes || ""}
                      onChange={(ev) => setCloseForm((f) => ({ ...f, mistakes: ev.target.value }))}
                      rows={2}
                      placeholder="Sized too large, ignored stop..."
                      className="w-full border border-[#e2e2df] rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#5b63f5] resize-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-[#aaa] uppercase tracking-wider mb-1 block">What did I learn?</label>
                    <textarea
                      value={closeForm.lessons || ""}
                      onChange={(ev) => setCloseForm((f) => ({ ...f, lessons: ev.target.value }))}
                      rows={2}
                      placeholder="Always wait for confirmation..."
                      className="w-full border border-[#e2e2df] rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#5b63f5] resize-none"
                    />
                  </div>

                  <button
                    onClick={handleCloseTrade}
                    disabled={saving}
                    className="w-full py-2.5 bg-[#1c1c1a] text-white text-[13px] font-medium rounded-[8px] hover:bg-[#333] transition-colors disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Close Trade"}
                  </button>
                </div>
              )}

              {/* ── VIEW ── */}
              {panelMode === "view" && selectedEntry && (
                <div className="space-y-3 text-[13px]">
                  <div className="grid grid-cols-2 gap-y-2.5 text-[12px]">
                    {[
                      ["Direction", selectedEntry.trade_type === "long" ? "Long" : "Short"],
                      ["Setup", selectedEntry.setup_type || "—"],
                      ["Entry Date", fmtDate(selectedEntry.entry_date)],
                      ["Exit Date", fmtDate(selectedEntry.exit_date)],
                      ["Entry Price", `₹${selectedEntry.entry_price.toLocaleString("en-IN")}`],
                      ["Exit Price", selectedEntry.exit_price ? `₹${selectedEntry.exit_price.toLocaleString("en-IN")}` : "—"],
                      ["Quantity", selectedEntry.quantity.toLocaleString("en-IN")],
                      ["Holding Days", selectedEntry.holding_days ?? "—"],
                      ["Stop Loss", selectedEntry.stop_loss ? `₹${selectedEntry.stop_loss.toLocaleString("en-IN")}` : "—"],
                      ["Target", selectedEntry.target_price ? `₹${selectedEntry.target_price.toLocaleString("en-IN")}` : "—"],
                      ["R:R", selectedEntry.risk_reward ?? "—"],
                      ["P&L", selectedEntry.pnl != null ? fmtCcy(selectedEntry.pnl) : "Open"],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <div className="text-[10px] text-[#aaa] uppercase tracking-wider">{k}</div>
                        <div className="font-medium text-[#1c1c1a] mt-0.5">{v}</div>
                      </div>
                    ))}
                  </div>
                  {selectedEntry.entry_reason && (
                    <div>
                      <div className="text-[10px] text-[#aaa] uppercase tracking-wider mb-1">Entry Reason</div>
                      <p className="text-[12px] text-[#555] leading-relaxed">{selectedEntry.entry_reason}</p>
                    </div>
                  )}
                  {selectedEntry.exit_reason && (
                    <div>
                      <div className="text-[10px] text-[#aaa] uppercase tracking-wider mb-1">Exit Reason</div>
                      <p className="text-[12px] text-[#555] leading-relaxed">{selectedEntry.exit_reason}</p>
                    </div>
                  )}
                  {selectedEntry.mistakes && (
                    <div>
                      <div className="text-[10px] text-[#aaa] uppercase tracking-wider mb-1">Mistakes</div>
                      <p className="text-[12px] text-[#e5383b] leading-relaxed">{selectedEntry.mistakes}</p>
                    </div>
                  )}
                  {selectedEntry.lessons && (
                    <div>
                      <div className="text-[10px] text-[#aaa] uppercase tracking-wider mb-1">Lessons</div>
                      <p className="text-[12px] text-[#26a65b] leading-relaxed">{selectedEntry.lessons}</p>
                    </div>
                  )}
                  {selectedEntry.status === "open" && (
                    <button
                      onClick={() => openClosePanel(selectedEntry)}
                      className="w-full py-2 bg-[#1c1c1a] text-white text-[13px] font-medium rounded-[8px] hover:bg-[#333] transition-colors"
                    >
                      Close this trade
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
