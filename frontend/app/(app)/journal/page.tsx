"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getJournalEntries,
  getJournalStats,
  getJournalAnalytics,
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  searchSymbols,
  analyseJournal,
  getAiPatterns,
  triggerTradeLesson,
  importZerodhaTrades,
  getBrokerStatus,
} from "@/lib/api";
import type { JournalEntry, JournalStats, JournalAnalytics, CreateJournalEntry, UpdateJournalEntry, SymbolSearchResult, AiPatterns } from "@/lib/api";

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
  if (pnl == null) return <span className="text-[12px]" style={{ color: "var(--app-text3)" }}>Open</span>;
  const pos = pnl >= 0;
  return (
    <span className="text-[12px] font-medium px-1.5 py-0.5 rounded-md"
      style={{ color: pos ? "#26A65B" : "#E5383B", background: pos ? "rgba(38,166,91,0.12)" : "rgba(229,56,59,0.12)" }}>
      {pos ? "+" : ""}{fmtCcy(pnl)}
    </span>
  );
}

function StatusBadge({ status, pnl }: { status: string; pnl: number | null }) {
  if (status === "open") {
    return <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full"
      style={{ background: "var(--app-teal-dim)", color: "var(--app-teal)" }}>Open</span>;
  }
  if (status === "closed" && pnl != null) {
    const win = pnl >= 0;
    return (
      <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full"
        style={{ background: win ? "rgba(38,166,91,0.12)" : "rgba(229,56,59,0.12)", color: win ? "#26A65B" : "#E5383B" }}>
        {win ? "Win" : "Loss"}
      </span>
    );
  }
  return <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full"
    style={{ background: "var(--app-surface3)", color: "var(--app-text3)" }}>{status}</span>;
}

// ── Setup type chips ──────────────────────────────────────────────────────────

const SETUP_TYPES = ["VCP", "Breakout", "Stage 2", "Base Build", "Cup & Handle", "Oversold Bounce", "Trend Follow", "Earnings Play", "Pullback", "Reversal", "Other"];

// ── Main page ─────────────────────────────────────────────────────────────────

type PanelMode = "add" | "close" | "view" | null;
type Tab = "trades" | "analytics" | "ai";

// ── Equity Curve SVG ──────────────────────────────────────────────────────────

function EquityCurve({ data }: { data: { date: string; cumulative_pnl: number }[] }) {
  if (data.length < 2) return (
    <div className="h-[160px] flex items-center justify-center text-[12px] text-[#ccc]">
      Close at least 2 trades to see equity curve
    </div>
  );
  const W = 600, H = 140, PAD = 8;
  const vals = data.map((d) => d.cumulative_pnl);
  const min = Math.min(0, ...vals);
  const max = Math.max(0, ...vals);
  const range = max - min || 1;
  const pts = data.map((d, i) => {
    const x = PAD + (i / (data.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((d.cumulative_pnl - min) / range) * (H - PAD * 2);
    return `${x},${y}`;
  });
  const zeroY = H - PAD - ((0 - min) / range) * (H - PAD * 2);
  const last = vals[vals.length - 1];
  const color = last >= 0 ? "#26a65b" : "#e5383b";
  const fillPts = `${PAD},${zeroY} ${pts.join(" ")} ${W - PAD},${zeroY}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[160px]" preserveAspectRatio="none">
      <defs>
        <linearGradient id="eq-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      <polygon points={fillPts} fill="url(#eq-grad)" />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ── Drawdown Chart SVG ────────────────────────────────────────────────────────

function DrawdownChart({ data }: { data: { date: string; drawdown: number; drawdown_pct: number }[] }) {
  if (data.length < 2) return null;
  const hasDD = data.some(d => d.drawdown < 0);
  if (!hasDD) return (
    <div className="h-[100px] flex items-center justify-center text-[12px] text-[#26a65b]">
      No drawdown — all-time high throughout
    </div>
  );
  const W = 600, H = 100, PAD = 8;
  const vals = data.map(d => d.drawdown);
  const min = Math.min(...vals, -0.01);
  const pts = data.map((d, i) => {
    const x = PAD + (i / (data.length - 1)) * (W - PAD * 2);
    const y = PAD + ((0 - d.drawdown) / (0 - min)) * (H - PAD * 2);
    return `${x},${y}`;
  });
  const zeroY = PAD;
  const fillPts = `${PAD},${H - PAD} ${pts.join(" ")} ${W - PAD},${H - PAD}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[100px]" preserveAspectRatio="none">
      <defs>
        <linearGradient id="dd-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e5383b" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#e5383b" stopOpacity="0.04" />
        </linearGradient>
      </defs>
      <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      <polygon points={fillPts} fill="url(#dd-grad)" />
      <polyline points={pts.join(" ")} fill="none" stroke="#e5383b" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export default function JournalPage() {
  const [tab, setTab] = useState<Tab>("trades");
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [journalPlan, setJournalPlan] = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiTradesCount, setAiTradesCount] = useState(0);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [patterns, setPatterns] = useState<AiPatterns | null>(null);
  const [patternsLoading, setPatternsLoading] = useState(false);
  const [brokerConnected, setBrokerConnected] = useState(false);
  const [brokerName, setBrokerName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [lessonLoading, setLessonLoading] = useState<string | null>(null);
  const [stats, setStats] = useState<JournalStats | null>(null);
  const [analytics, setAnalytics] = useState<JournalAnalytics | null>(null);
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
  const [closeSetupType, setCloseSetupType] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = filterStatus === "all" ? {} : { status: filterStatus };
      const [e, s, a] = await Promise.all([getJournalEntries(params), getJournalStats(), getJournalAnalytics()]);
      setEntries(e.entries);
      setJournalPlan(e.plan ?? null);
      setStats(s);
      setAnalytics(a);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { load(); }, [load]);

  // Load broker status + patterns on mount
  useEffect(() => {
    getBrokerStatus().then(s => {
      setBrokerConnected(s.connected);
      setBrokerName(s.broker);
    }).catch(() => {});
  }, []);

  // Load patterns when AI tab is opened
  useEffect(() => {
    if (tab !== "ai" || patterns !== null) return;
    setPatternsLoading(true);
    getAiPatterns().then(setPatterns).catch(() => {}).finally(() => setPatternsLoading(false));
  }, [tab, patterns]);

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
      await updateJournalEntry(selectedEntry.id, { ...closeForm, ...(closeSetupType ? { setup_type: closeSetupType } : {}) } as UpdateJournalEntry);
      setPanelMode(null);
      setSelectedEntry(null);
      showToast("Trade closed — AI analysing in background…");
      load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Failed to close");
    } finally {
      setSaving(false);
    }
  };

  const handleGetLesson = async (entry: JournalEntry) => {
    setLessonLoading(entry.id);
    try {
      const updated = await triggerTradeLesson(entry.id);
      setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
      if (selectedEntry?.id === updated.id) setSelectedEntry(updated);
      showToast("AI lesson generated");
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "AI lesson failed");
    } finally {
      setLessonLoading(null);
    }
  };

  const handleImportZerodha = async () => {
    setImporting(true);
    try {
      const r = await importZerodhaTrades();
      showToast(r.message);
      if (r.imported > 0) load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
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
    setCloseSetupType(e.setup_type || "");
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
    <div className="min-h-full" style={{ background: "var(--app-bg)" }}>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 text-[13px] px-4 py-2 rounded-lg shadow-lg"
          style={{ background: "var(--app-surface2)", border: "1px solid var(--app-border)", color: "var(--app-text1)" }}>
          {toast}
        </div>
      )}

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
            color: "#0f0f0e",
          },
          {
            label: "Open Trades",
            val: stats?.open_trades ?? "—",
            color: "#5b63f5",
          },
        ].map((item) => (
          <div key={item.label} className="px-4 py-3.5" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: "12px" }}>
            <div className="text-[22px] font-bold tracking-tight leading-none tabular" style={{ color: item.color }}>
              {item.val}
            </div>
            <div className="text-[10px] uppercase tracking-wider mt-1" style={{ color: "var(--app-text3)" }}>{item.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 px-5 pt-3">
        {([
          { id: "trades", label: "Trades" },
          { id: "analytics", label: "Analytics" },
          { id: "ai", label: "AI Analysis" },
        ] as { id: Tab; label: string }[]).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="px-4 py-1.5 text-[13px] rounded-t-[8px] transition-colors font-medium"
            style={tab === id
              ? { background: "var(--app-surface)", color: "var(--app-text1)", border: "1px solid var(--app-border)", borderBottom: "none" }
              : { color: "var(--app-text3)", background: "transparent", border: "none" }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Analytics Panel */}
      {tab === "analytics" && (
        <div className="px-5 pb-5">
          <div className="p-5 space-y-6" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: "12px" }}>
            {/* Equity Curve */}
            <div>
              <div className="text-[12px] font-semibold mb-1" style={{ color: "var(--app-text1)" }}>Equity Curve</div>
              <div className="text-[11px] mb-3" style={{ color: "var(--app-text3)" }}>Cumulative P&amp;L across closed trades</div>
              <EquityCurve data={analytics?.equity_curve ?? []} />
            </div>

            {/* Monthly P&L */}
            {(analytics?.monthly_pnl?.length ?? 0) > 0 && (
              <div>
                <div className="text-[12px] font-semibold mb-3" style={{ color: "var(--app-text1)" }}>Monthly P&amp;L</div>
                <div className="flex gap-2 flex-wrap">
                  {analytics!.monthly_pnl.map((m) => {
                    const pos = m.pnl >= 0;
                    return (
                      <div key={m.month} className="flex-1 min-w-[80px] rounded-[8px] px-3 py-2.5 text-center"
                        style={{ background: pos ? "#edfaf3" : "#fff0f0" }}>
                        <div className="text-[11px] font-bold" style={{ color: pos ? "#26a65b" : "#e5383b" }}>
                          {m.pnl >= 0 ? "+" : ""}₹{Math.abs(m.pnl).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                        </div>
                        <div className="text-[10px] mt-0.5" style={{ color: "var(--app-text3)" }}>{m.month}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Setup Breakdown */}
            {(analytics?.setup_breakdown?.length ?? 0) > 0 && (
              <div>
                <div className="text-[12px] font-semibold mb-3" style={{ color: "var(--app-text1)" }}>Performance by Setup</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
                        {["Setup", "Trades", "Win Rate", "Avg P&L", "Total P&L"].map((h) => (
                          <th key={h} className="text-left pb-2 text-[11px] font-medium uppercase tracking-wider pr-4" style={{ color: "var(--app-text3)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {analytics!.setup_breakdown.map((s) => {
                        const pos = s.total_pnl >= 0;
                        return (
                          <tr key={s.setup} style={{ borderBottom: "1px solid var(--app-border2)" }}>
                            <td className="py-2.5 pr-4 font-medium" style={{ color: "var(--app-text1)" }}>{s.setup}</td>
                            <td className="py-2.5 pr-4" style={{ color: "var(--app-text2)" }}>{s.trades}</td>
                            <td className="py-2.5 pr-4">
                              <span className="font-semibold" style={{ color: s.win_rate >= 50 ? "#26a65b" : "#e5383b" }}>
                                {s.win_rate}%
                              </span>
                            </td>
                            <td className="py-2.5 pr-4">
                              <span style={{ color: s.avg_pnl >= 0 ? "#26a65b" : "#e5383b" }}>
                                {s.avg_pnl >= 0 ? "+" : ""}₹{Math.abs(s.avg_pnl).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                              </span>
                            </td>
                            <td className="py-2.5">
                              <span className="font-semibold" style={{ color: pos ? "#26a65b" : "#e5383b" }}>
                                {pos ? "+" : ""}₹{Math.abs(s.total_pnl).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Drawdown Analysis */}
            {(analytics?.drawdown_curve?.length ?? 0) > 1 && (
              <div>
                <div className="text-[12px] font-semibold mb-1" style={{ color: "var(--app-text1)" }}>Drawdown</div>
                <div className="text-[11px] mb-2" style={{ color: "var(--app-text3)" }}>Underwater equity relative to all-time high</div>
                <DrawdownChart data={analytics!.drawdown_curve} />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                  {[
                    { label: "Max Drawdown",    val: analytics!.max_drawdown != null ? `₹${analytics!.max_drawdown.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "—", color: "#e5383b" },
                    { label: "Longest DD",      val: analytics!.longest_dd_days ? `${analytics!.longest_dd_days}d` : "—", color: "#d97706" },
                    { label: "Recovery Factor", val: analytics!.recovery_factor != null ? analytics!.recovery_factor.toFixed(2) : "—", color: analytics!.recovery_factor != null && analytics!.recovery_factor >= 1 ? "#26a65b" : "#e5383b" },
                    { label: "Profit Factor",   val: analytics!.profit_factor   != null ? analytics!.profit_factor.toFixed(2)   : "—", color: analytics!.profit_factor   != null && analytics!.profit_factor   >= 1 ? "#26a65b" : "#e5383b" },
                  ].map(item => (
                    <div key={item.label} className="rounded-[8px] px-3 py-2.5 text-center" style={{ background: "var(--app-surface3)" }}>
                      <div className="text-[14px] font-bold" style={{ color: item.color }}>{item.val}</div>
                      <div className="text-[10px] mt-0.5" style={{ color: "var(--app-text3)" }}>{item.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!analytics?.setup_breakdown?.length && !analytics?.equity_curve?.length && (
              <div className="text-center py-8 text-[13px] text-[#aaa]">
                Close some trades to see analytics here.
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI MistakeEngine Panel */}
      {tab === "ai" && (
        <div className="px-5 pb-5 space-y-4">

          {/* Pattern Stats */}
          <div className="p-5" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: "12px" }}>
            <div className="text-[13px] font-bold mb-1" style={{ color: "var(--app-text1)" }}>Pattern Stats</div>
            <div className="text-[12px] mb-4" style={{ color: "var(--app-text3)" }}>Computed from your closed trades — no AI needed.</div>

            {patternsLoading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-10 rounded-[8px] animate-pulse" style={{ background: "var(--app-surface3)" }} />)}
              </div>
            ) : !patterns?.ready ? (
              <div className="text-center py-6 text-[12px] text-[#aaa]">
                Close at least {patterns?.min_trades_required ?? 3} trades to see pattern stats.
                {patterns?.trades_available != null && patterns.trades_available > 0 && (
                  <span className="block mt-1">You have {patterns.trades_available} so far.</span>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                {/* Holding period: winners vs losers */}
                {(patterns.avg_hold_winners != null || patterns.avg_hold_losers != null) && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide mb-2" style={{ color: "var(--app-text2)" }}>Avg Holding Period</div>
                    <div className="flex gap-3">
                      {patterns.avg_hold_winners != null && (
                        <div className="flex-1 rounded-[8px] px-3 py-2.5 text-center" style={{ background: "rgba(38,166,91,0.12)" }}>
                          <div className="text-[16px] font-bold text-[#26a65b]">{patterns.avg_hold_winners}d</div>
                          <div className="text-[10px] mt-0.5" style={{ color: "var(--app-text2)" }}>Winners</div>
                        </div>
                      )}
                      {patterns.avg_hold_losers != null && (
                        <div className="flex-1 rounded-[8px] px-3 py-2.5 text-center" style={{ background: "rgba(229,56,59,0.12)" }}>
                          <div className="text-[16px] font-bold text-[#e5383b]">{patterns.avg_hold_losers}d</div>
                          <div className="text-[10px] mt-0.5" style={{ color: "var(--app-text2)" }}>Losers</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Win rate by day of week */}
                {(patterns.day_of_week?.length ?? 0) > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide mb-2" style={{ color: "var(--app-text2)" }}>Win Rate by Day</div>
                    <div className="flex gap-1.5 flex-wrap">
                      {patterns.day_of_week!.map(d => (
                        <div key={d.day} className="flex-1 min-w-[60px] rounded-[8px] px-2 py-2 text-center" style={{ border: "1px solid var(--app-border)" }}>
                          <div className="text-[13px] font-bold"
                            style={{ color: d.win_rate >= 60 ? "#26a65b" : d.win_rate >= 40 ? "#d97706" : "#e5383b" }}>
                            {d.win_rate}%
                          </div>
                          <div className="text-[10px] mt-0.5" style={{ color: "var(--app-text3)" }}>{d.day.slice(0, 3)}</div>
                          <div className="text-[9px]" style={{ color: "var(--app-text3)" }}>{d.trades}t</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Holding period buckets */}
                {(patterns.by_holding_period?.length ?? 0) > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide mb-2" style={{ color: "var(--app-text2)" }}>Win Rate by Holding Period</div>
                    <div className="space-y-1.5">
                      {patterns.by_holding_period!.map(b => (
                        <div key={b.bucket} className="flex items-center gap-3">
                          <div className="w-[110px] text-[11px] flex-shrink-0" style={{ color: "var(--app-text2)" }}>{b.bucket}</div>
                          <div className="flex-1 rounded-full h-2 overflow-hidden" style={{ background: "var(--app-surface3)" }}>
                            <div className="h-full rounded-full transition-all"
                              style={{
                                width: `${b.win_rate}%`,
                                background: b.win_rate >= 60 ? "#26a65b" : b.win_rate >= 40 ? "#d97706" : "#e5383b"
                              }} />
                          </div>
                          <div className="text-[12px] font-semibold w-10 text-right"
                            style={{ color: b.win_rate >= 60 ? "#26a65b" : b.win_rate >= 40 ? "#d97706" : "#e5383b" }}>
                            {b.win_rate}%
                          </div>
                          <div className="text-[10px] w-8" style={{ color: "var(--app-text3)" }}>{b.trades}t</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Long vs Short */}
                {(patterns.by_direction?.length ?? 0) > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide mb-2" style={{ color: "var(--app-text2)" }}>Long vs Short</div>
                    <div className="flex gap-3">
                      {patterns.by_direction!.map(d => (
                        <div key={d.direction} className="flex-1 rounded-[8px] px-3 py-2.5" style={{ border: "1px solid var(--app-border)" }}>
                          <div className="text-[14px] font-bold"
                            style={{ color: d.win_rate >= 50 ? "#26a65b" : "#e5383b" }}>
                            {d.win_rate}%
                          </div>
                          <div className="text-[11px] mt-0.5" style={{ color: "var(--app-text2)" }}>{d.direction} · {d.trades} trades</div>
                          <div className="text-[11px] mt-0.5"
                            style={{ color: d.total_pnl >= 0 ? "#26a65b" : "#e5383b" }}>
                            {d.total_pnl >= 0 ? "+" : ""}₹{Math.abs(d.total_pnl).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* AI Deep Analysis */}
          <div className="p-5" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: "12px" }}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-[14px] font-bold" style={{ color: "var(--app-text1)" }}>AI Deep Analysis</div>
                <div className="text-[12px] mt-0.5" style={{ color: "var(--app-text3)" }}>
                  Claude reads your full journal and surfaces mistakes, patterns, and specific rules to add to your playbook.
                </div>
              </div>
              <button
                onClick={async () => {
                  setAiLoading(true);
                  setAiError("");
                  setAiAnalysis(null);
                  try {
                    const r = await analyseJournal();
                    setAiAnalysis(r.analysis);
                    setAiTradesCount(r.trades_analysed);
                  } catch (e: unknown) {
                    setAiError(e instanceof Error ? e.message : "Analysis failed");
                  } finally {
                    setAiLoading(false);
                  }
                }}
                disabled={aiLoading}
                className="flex-shrink-0 px-4 py-2 rounded-[8px] text-[12px] font-semibold disabled:opacity-50 transition-opacity ml-4"
                style={{ background: "var(--app-teal)", color: "#0D0F14" }}
              >
                {aiLoading ? "Analysing…" : aiAnalysis ? "Re-analyse" : "Analyse my trades"}
              </button>
            </div>

            {aiError && (
              <div className="text-[13px] text-[#e5383b] bg-[#fff0f0] border border-[#ffd0d0] rounded-[8px] px-4 py-3">
                {aiError}
              </div>
            )}

            {aiLoading && (
              <div className="flex flex-col items-center py-12 gap-3">
                <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: "var(--app-teal)", borderTopColor: "transparent" }} />
                <div className="text-[12px]" style={{ color: "var(--app-text3)" }}>Reading your journal and finding patterns…</div>
              </div>
            )}

            {aiAnalysis && !aiLoading && (
              <div>
                <div className="text-[11px] mb-3" style={{ color: "var(--app-text3)" }}>Based on {aiTradesCount} closed trades</div>
                <div className="mb-3 px-3 py-2 rounded-lg text-[11px] leading-relaxed" style={{ background: "rgba(217,119,6,0.10)", border: "1px solid rgba(217,119,6,0.25)", color: "#fbbf24" }}>
                  <strong>Disclaimer:</strong> AI analysis is for educational purposes only and does not constitute SEBI-registered investment advice. Past performance is not indicative of future results.
                </div>
                <div className="prose prose-sm max-w-none text-[13px] leading-relaxed space-y-3" style={{ color: "var(--app-text1)" }}>
                  {aiAnalysis.split("\n").map((line, i) => {
                    if (line.startsWith("## ") || line.startsWith("### ")) {
                      return <div key={i} className="text-[13px] font-bold text-[#0f0f0e] mt-4 mb-1">{line.replace(/^#+\s/, "")}</div>;
                    }
                    if (line.startsWith("**") && line.endsWith("**")) {
                      return <div key={i} className="text-[13px] font-bold text-[#0f0f0e] mt-3 mb-1">{line.replace(/\*\*/g, "")}</div>;
                    }
                    if (line.startsWith("- ") || line.startsWith("* ")) {
                      return (
                        <div key={i} className="flex gap-2 items-start">
                          <span className="text-[#5b63f5] mt-0.5 flex-shrink-0">•</span>
                          <span dangerouslySetInnerHTML={{ __html: line.slice(2).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />
                        </div>
                      );
                    }
                    if (line.trim() === "") return <div key={i} className="h-1" />;
                    return <div key={i} dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />;
                  })}
                </div>
              </div>
            )}

            {!aiAnalysis && !aiLoading && !aiError && (
              <div className="text-center py-10">
                <div className="text-[13px] text-[#aaa]">Click &quot;Analyse my trades&quot; to get AI-powered insights on your trading patterns.</div>
                <div className="text-[12px] text-[#bbb] mt-1">Requires at least 3 closed trades.</div>
              </div>
            )}
          </div>

        </div>
      )}

      {/* Body */}
      {tab === "trades" && <div className="flex gap-2.5 px-5 pt-0 pb-5">
        {/* Trade list */}
        <div className="flex-1 min-w-0">
          {/* Toolbar */}
          <div className="flex items-center gap-2 mb-2.5">
            <div className="flex rounded-[8px] p-0.5 gap-0.5" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              {(["all", "open", "closed"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className="px-3 py-1 text-[12px] rounded-[6px] capitalize transition-colors"
                  style={filterStatus === s
                    ? { background: "var(--app-teal)", color: "#0D0F14" }
                    : { color: "var(--app-text3)", background: "transparent" }
                  }
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            {brokerConnected && brokerName === "zerodha" && (
              <button
                onClick={handleImportZerodha}
                disabled={importing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-[8px] transition-colors disabled:opacity-50"
                style={{ border: "1px solid var(--app-border)", color: "var(--app-text2)" }}
              >
                {importing ? "Importing…" : "↓ Import from Zerodha"}
              </button>
            )}
            <button
              onClick={openAddPanel}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-[8px] transition-colors"
              style={{ background: "var(--app-teal)", color: "#0D0F14" }}
            >
              <span className="text-[16px] leading-none">+</span> Log trade
            </button>
          </div>

          {/* Free plan history notice */}
          {journalPlan === "free" && (
            <div className="flex items-center justify-between px-4 py-2.5 rounded-[8px] mb-3 text-[12px]"
              style={{ background: "rgba(217,119,6,0.10)", border: "1px solid rgba(217,119,6,0.25)" }}>
              <span style={{ color: "#fbbf24" }}>Free plan shows last 3 months of trades only.</span>
              <a href="/settings/billing" className="font-semibold hover:underline ml-4" style={{ color: "#d97706" }}>Upgrade to Pro →</a>
            </div>
          )}

          {/* Table */}
          <div className="overflow-hidden" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: "12px" }}>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[#f2f2f0]">
                  {["Symbol", "Type", "Entry", "Entry px", "Exit px", "P&L", "Status", ""].map((h) => (
                    <th key={h} className="text-left px-3 py-2.5 text-[11px] font-medium uppercase tracking-wider"
                      style={{ color: "var(--app-text3)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--app-border2)" }}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j} className="px-3 py-3">
                          <div className="h-4 rounded animate-pulse w-16" style={{ background: "var(--app-surface3)" }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : entries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-12 text-center">
                      <div className="text-[13px]" style={{ color: "var(--app-text3)" }}>No trades yet.</div>
                      <button onClick={openAddPanel} className="mt-2 text-[13px] hover:underline"
                        style={{ color: "var(--app-teal)" }}>
                        Log your first trade →
                      </button>
                    </td>
                  </tr>
                ) : (
                  entries.map((e) => (
                    <tr
                      key={e.id}
                      onClick={() => { setSelectedEntry(e); setPanelMode("view"); }}
                      className="cursor-pointer transition-colors"
                      style={{
                        borderBottom: "1px solid var(--app-border2)",
                        background: selectedEntry?.id === e.id ? "var(--app-teal-dim)" : "transparent",
                      }}
                    >
                      <td className="px-3 py-2.5">
                        <span className="font-medium" style={{ color: "var(--app-text1)" }}>{e.symbol}</span>
                        {e.setup_type && (
                          <span className="ml-1.5 text-[10px]" style={{ color: "var(--app-text3)" }}>{e.setup_type}</span>
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
                      <td className="px-3 py-2.5" style={{ color: "var(--app-text2)" }}>{fmtDate(e.entry_date)}</td>
                      <td className="px-3 py-2.5 font-medium" style={{ color: "var(--app-text1)" }}>₹{e.entry_price.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-2.5" style={{ color: "var(--app-text2)" }}>
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
                            className="text-[11px]"
                            style={{ color: "var(--app-text3)" }}
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
            <div className="p-5" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: "12px" }}>
              {/* Panel header */}
              <div className="flex items-center justify-between mb-4">
                <div className="text-[14px] font-semibold" style={{ color: "var(--app-text1)" }}>
                  {panelMode === "add" ? "Log Trade" : panelMode === "close" ? `Close ${selectedEntry?.symbol}` : selectedEntry?.symbol}
                </div>
                <button onClick={() => { setPanelMode(null); setSelectedEntry(null); }} className="text-[18px] leading-none"
                  style={{ color: "var(--app-text3)" }}>×</button>
              </div>

              {/* ── ADD FORM ── */}
              {panelMode === "add" && (
                <div className="space-y-3">
                  {/* Symbol search */}
                  <div className="relative">
                    <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: "var(--app-text3)" }}>Symbol</label>
                    <input
                      value={selectedSymbol || symbolQ}
                      onChange={(ev) => {
                        setSelectedSymbol("");
                        setSymbolQ(ev.target.value.toUpperCase());
                      }}
                      placeholder="e.g. RELIANCE"
                      className="w-full rounded-[8px] px-3 py-2 text-[13px] outline-none"
                      style={{ background: "var(--app-surface3)", border: "1px solid var(--app-border)", color: "var(--app-text1)" }}
                    />
                    {symbolResults.length > 0 && !selectedSymbol && (
                      <div className="absolute top-full left-0 right-0 rounded-[8px] shadow-lg z-20 overflow-hidden mt-0.5"
                        style={{ background: "var(--app-surface2)", border: "1px solid var(--app-border)" }}>
                        {symbolResults.map((r) => (
                          <button
                            key={r.symbol}
                            onClick={() => {
                              setSelectedSymbol(r.symbol);
                              setSymbolQ(r.symbol);
                              setSymbolResults([]);
                            }}
                            className="w-full text-left px-3 py-2 text-[13px]"
                          style={{ color: "var(--app-text1)" }}
                          >
                            <span className="font-medium" style={{ color: "var(--app-text1)" }}>{r.symbol}</span>
                            <span className="ml-2 text-[11px]" style={{ color: "var(--app-text3)" }}>{r.company_name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Long / Short */}
                  <div>
                    <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: "var(--app-text3)" }}>Direction</label>
                    <div className="flex gap-2">
                      {(["long", "short"] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => setAddForm((f) => ({ ...f, trade_type: t }))}
                          className="flex-1 py-2 rounded-[8px] text-[13px] font-medium border transition-colors capitalize"
                          style={addForm.trade_type === t
                            ? { background: t === "long" ? "rgba(38,166,91,0.15)" : "rgba(229,56,59,0.15)", color: t === "long" ? "#26A65B" : "#E5383B", borderColor: t === "long" ? "#26A65B" : "#E5383B" }
                            : { background: "var(--app-surface3)", color: "var(--app-text3)", borderColor: "var(--app-border)" }
                          }
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Entry date */}
                  <div>
                    <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: "var(--app-text3)" }}>Entry Date</label>
                    <input
                      type="date"
                      value={addForm.entry_date || ""}
                      onChange={(ev) => setAddForm((f) => ({ ...f, entry_date: ev.target.value }))}
                      className="w-full rounded-[8px] px-3 py-2 text-[13px] outline-none"
                    style={{ background: "var(--app-surface3)", border: "1px solid var(--app-border)", color: "var(--app-text1)" }}
                    />
                  </div>

                  {/* Price + Qty */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: "var(--app-text3)" }}>Entry Price ₹</label>
                      <input
                        type="number"
                        value={addForm.entry_price || ""}
                        onChange={(ev) => setAddForm((f) => ({ ...f, entry_price: parseFloat(ev.target.value) || undefined }))}
                        placeholder="0.00"
                        className="w-full rounded-[8px] px-3 py-2 text-[13px] outline-none"
                    style={{ background: "var(--app-surface3)", border: "1px solid var(--app-border)", color: "var(--app-text1)" }}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: "var(--app-text3)" }}>Quantity</label>
                      <input
                        type="number"
                        value={addForm.quantity || ""}
                        onChange={(ev) => setAddForm((f) => ({ ...f, quantity: parseInt(ev.target.value) || undefined }))}
                        placeholder="0"
                        className="w-full rounded-[8px] px-3 py-2 text-[13px] outline-none"
                    style={{ background: "var(--app-surface3)", border: "1px solid var(--app-border)", color: "var(--app-text1)" }}
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
                      <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: "var(--app-text3)" }}>Stop Loss ₹</label>
                      <input
                        type="number"
                        value={addForm.stop_loss || ""}
                        onChange={(ev) => setAddForm((f) => ({ ...f, stop_loss: parseFloat(ev.target.value) || undefined }))}
                        placeholder="optional"
                        className="w-full rounded-[8px] px-3 py-2 text-[13px] outline-none"
                    style={{ background: "var(--app-surface3)", border: "1px solid var(--app-border)", color: "var(--app-text1)" }}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: "var(--app-text3)" }}>Target ₹</label>
                      <input
                        type="number"
                        value={addForm.target_price || ""}
                        onChange={(ev) => setAddForm((f) => ({ ...f, target_price: parseFloat(ev.target.value) || undefined }))}
                        placeholder="optional"
                        className="w-full rounded-[8px] px-3 py-2 text-[13px] outline-none"
                    style={{ background: "var(--app-surface3)", border: "1px solid var(--app-border)", color: "var(--app-text1)" }}
                      />
                    </div>
                  </div>
                  {(riskRupees || rrRatio) && (
                    <div className="text-[11px] text-[#aaa] flex gap-3">
                      {riskRupees && <span>Risk: ₹{riskRupees.toLocaleString("en-IN")}</span>}
                      {rrRatio && (
                        <span className="font-semibold" style={{ color: parseFloat(rrRatio) >= 2 ? "#26a65b" : "#d97706" }}>
                          R:R = 1:{rrRatio} {parseFloat(rrRatio) >= 2 ? "✓" : "⚠ below 2:1"}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Setup type */}
                  <div>
                    <label className="text-[11px] uppercase tracking-wider mb-1.5 block" style={{ color: "var(--app-text3)" }}>Setup</label>
                    <div className="flex flex-wrap gap-1.5">
                      {SETUP_TYPES.map((s) => (
                        <button
                          key={s}
                          onClick={() => setAddForm((f) => ({ ...f, setup_type: f.setup_type === s.toLowerCase() ? undefined : s.toLowerCase() }))}
                          className="px-2.5 py-1 text-[12px] rounded-full border transition-colors"
                          style={addForm.setup_type === s.toLowerCase()
                            ? { background: "var(--app-teal)", color: "#0D0F14", borderColor: "var(--app-teal)" }
                            : { background: "var(--app-surface3)", color: "var(--app-text3)", borderColor: "var(--app-border)" }
                          }
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Entry reason */}
                  <div>
                    <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: "var(--app-text3)" }}>Why are you entering?</label>
                    <textarea
                      value={addForm.entry_reason || ""}
                      onChange={(ev) => setAddForm((f) => ({ ...f, entry_reason: ev.target.value }))}
                      rows={3}
                      placeholder="EMA alignment, volume surge, breakout of resistance..."
                      className="w-full rounded-[8px] px-3 py-2 text-[13px] outline-none resize-none"
                    style={{ background: "var(--app-surface3)", border: "1px solid var(--app-border)", color: "var(--app-text1)" }}
                    />
                  </div>

                  <button onClick={handleAddTrade} disabled={saving}
                    className="w-full py-2.5 text-[13px] font-medium rounded-[8px] transition-colors disabled:opacity-50"
                    style={{ background: "var(--app-teal)", color: "#0D0F14" }}>
                    {saving ? "Saving..." : "Save Trade"}
                  </button>
                </div>
              )}

              {/* ── CLOSE FORM ── */}
              {panelMode === "close" && selectedEntry && (
                <div className="space-y-3">
                  <div className="text-[12px] pb-2" style={{ color: "var(--app-text2)", borderBottom: "1px solid var(--app-border)" }}>
                    {selectedEntry.trade_type === "long" ? "Long" : "Short"} · {selectedEntry.quantity} qty · Entered ₹{selectedEntry.entry_price.toLocaleString("en-IN")} on {fmtDate(selectedEntry.entry_date)}
                  </div>

                  <div>
                    <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: "var(--app-text3)" }}>Exit Date</label>
                    <input
                      type="date"
                      value={closeForm.exit_date || ""}
                      onChange={(ev) => setCloseForm((f) => ({ ...f, exit_date: ev.target.value }))}
                      className="w-full rounded-[8px] px-3 py-2 text-[13px] outline-none"
                    style={{ background: "var(--app-surface3)", border: "1px solid var(--app-border)", color: "var(--app-text1)" }}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: "var(--app-text3)" }}>Exit Price ₹</label>
                    <input
                      type="number"
                      value={closeForm.exit_price || ""}
                      onChange={(ev) => setCloseForm((f) => ({ ...f, exit_price: parseFloat(ev.target.value) || undefined }))}
                      placeholder="0.00"
                      className="w-full rounded-[8px] px-3 py-2 text-[13px] outline-none"
                    style={{ background: "var(--app-surface3)", border: "1px solid var(--app-border)", color: "var(--app-text1)" }}
                    />
                  </div>

                  {pnlPreview != null && (
                    <div
                      className="text-[13px] font-semibold px-3 py-2 rounded-[8px]"
                      style={{
                        color: pnlPreview >= 0 ? "#26A65B" : "#E5383B",
                        background: pnlPreview >= 0 ? "rgba(38,166,91,0.12)" : "rgba(229,56,59,0.12)",
                      }}
                    >
                      P&L: {pnlPreview >= 0 ? "+" : ""}{fmtCcy(pnlPreview)}
                      {" "}({((pnlPreview / (selectedEntry.entry_price * selectedEntry.quantity)) * 100).toFixed(2)}%)
                    </div>
                  )}

                  <div>
                    <label className="text-[11px] uppercase tracking-wider mb-1.5 block" style={{ color: "var(--app-text3)" }}>Setup</label>
                    <div className="flex flex-wrap gap-1.5">
                      {SETUP_TYPES.map((s) => (
                        <button
                          key={s}
                          onClick={() => setCloseSetupType(t => t === s.toLowerCase() ? "" : s.toLowerCase())}
                          className="px-2.5 py-1 text-[12px] rounded-full border transition-colors"
                          style={closeSetupType === s.toLowerCase()
                            ? { background: "var(--app-teal)", color: "#0D0F14", borderColor: "var(--app-teal)" }
                            : { background: "var(--app-surface3)", color: "var(--app-text3)", borderColor: "var(--app-border)" }
                          }
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: "var(--app-text3)" }}>Why did you exit?</label>
                    <textarea
                      value={closeForm.exit_reason || ""}
                      onChange={(ev) => setCloseForm((f) => ({ ...f, exit_reason: ev.target.value }))}
                      rows={2}
                      placeholder="Target hit, stop loss, chart breakdown..."
                      className="w-full rounded-[8px] px-3 py-2 text-[13px] outline-none resize-none"
                    style={{ background: "var(--app-surface3)", border: "1px solid var(--app-border)", color: "var(--app-text1)" }}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: "var(--app-text3)" }}>What went wrong?</label>
                    <textarea
                      value={closeForm.mistakes || ""}
                      onChange={(ev) => setCloseForm((f) => ({ ...f, mistakes: ev.target.value }))}
                      rows={2}
                      placeholder="Sized too large, ignored stop..."
                      className="w-full rounded-[8px] px-3 py-2 text-[13px] outline-none resize-none"
                    style={{ background: "var(--app-surface3)", border: "1px solid var(--app-border)", color: "var(--app-text1)" }}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] uppercase tracking-wider mb-1 block" style={{ color: "var(--app-text3)" }}>What did I learn?</label>
                    <textarea
                      value={closeForm.lessons || ""}
                      onChange={(ev) => setCloseForm((f) => ({ ...f, lessons: ev.target.value }))}
                      rows={2}
                      placeholder="Always wait for confirmation..."
                      className="w-full rounded-[8px] px-3 py-2 text-[13px] outline-none resize-none"
                    style={{ background: "var(--app-surface3)", border: "1px solid var(--app-border)", color: "var(--app-text1)" }}
                    />
                  </div>

                  <button onClick={handleCloseTrade} disabled={saving}
                    className="w-full py-2.5 text-[13px] font-medium rounded-[8px] transition-colors disabled:opacity-50"
                    style={{ background: "var(--app-teal)", color: "#0D0F14" }}>
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
                        <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--app-text3)" }}>{k}</div>
                        <div className="font-medium mt-0.5" style={{ color: "var(--app-text1)" }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {selectedEntry.entry_reason && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--app-text3)" }}>Entry Reason</div>
                      <p className="text-[12px] leading-relaxed" style={{ color: "var(--app-text2)" }}>{selectedEntry.entry_reason}</p>
                    </div>
                  )}
                  {selectedEntry.exit_reason && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--app-text3)" }}>Exit Reason</div>
                      <p className="text-[12px] leading-relaxed" style={{ color: "var(--app-text2)" }}>{selectedEntry.exit_reason}</p>
                    </div>
                  )}
                  {selectedEntry.mistakes && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--app-text3)" }}>Mistakes</div>
                      <p className="text-[12px] leading-relaxed" style={{ color: "#E5383B" }}>{selectedEntry.mistakes}</p>
                    </div>
                  )}
                  {selectedEntry.lessons ? (
                    <div className="rounded-[8px] p-3" style={{ background: "rgba(38,166,91,0.10)", border: "1px solid rgba(38,166,91,0.2)" }}>
                      <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1"
                        style={{ color: "#26A65B" }}>
                        <span>✦</span> AI Lesson
                      </div>
                      {selectedEntry.lessons.split("\n").map((line, i) => {
                        if (!line.trim()) return null;
                        const clean = line.replace(/^[-•*]\s*/, "").replace(/\*\*(.*?)\*\*/g, "$1");
                        return (
                          <div key={i} className="flex gap-1.5 items-start text-[12px] leading-relaxed mb-1"
                            style={{ color: "var(--app-text2)" }}>
                            <span className="mt-0.5 flex-shrink-0" style={{ color: "#26A65B" }}>•</span>
                            <span>{clean}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : selectedEntry.status === "closed" && (
                    <button onClick={() => handleGetLesson(selectedEntry)} disabled={lessonLoading === selectedEntry.id}
                      className="w-full py-2 rounded-[8px] text-[12px] font-medium transition-colors disabled:opacity-50"
                      style={{ border: "1px solid var(--app-teal)", color: "var(--app-teal)", background: "transparent" }}>
                      {lessonLoading === selectedEntry.id ? "Generating AI lesson…" : "✦ Get AI lesson for this trade"}
                    </button>
                  )}
                  {selectedEntry.status === "open" && (
                    <button onClick={() => openClosePanel(selectedEntry)}
                      className="w-full py-2 text-[13px] font-medium rounded-[8px] transition-colors"
                      style={{ background: "var(--app-teal)", color: "#0D0F14" }}>
                      Close this trade
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>}
    </div>
  );
}
