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
import { Card, StatCard, Badge } from "@/components/ui";

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

// ── Setup type chips ──────────────────────────────────────────────────────────

const SETUP_TYPES = ["VCP", "Breakout", "Stage 2", "Base Build", "Cup & Handle", "Oversold Bounce", "Trend Follow", "Earnings Play", "Pullback", "Reversal", "Other"];

function SetupChips({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
      {SETUP_TYPES.map(s => {
        const active = value === s.toLowerCase();
        return (
          <button key={s} onClick={() => onChange(active ? "" : s.toLowerCase())} style={{
            padding: "3px 10px", fontSize: 11, fontWeight: 500, cursor: "pointer",
            border: `1px solid ${active ? "var(--accent)" : "var(--border-subtle)"}`,
            background: active ? "var(--accent-subtle)" : "transparent",
            color: active ? "var(--accent)" : "var(--text-secondary)",
            borderRadius: "var(--radius-sm)",
            transition: "all var(--motion-instant) var(--ease-out)",
          }}>{s}</button>
        );
      })}
    </div>
  );
}

// ── Equity Curve SVG ──────────────────────────────────────────────────────────

function EquityCurve({ data }: { data: { date: string; cumulative_pnl: number }[] }) {
  if (data.length < 2) return (
    <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--text-tertiary)" }}>
      Close at least 2 trades to see equity curve
    </div>
  );
  const W = 600, H = 140, PAD = 8;
  const vals = data.map(d => d.cumulative_pnl);
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
  const color = last >= 0 ? "var(--gain)" : "var(--loss)";
  const fillPts = `${PAD},${zeroY} ${pts.join(" ")} ${W - PAD},${zeroY}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 160 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="eq-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={last >= 0 ? "#2DB574" : "#E15560"} stopOpacity="0.18" />
          <stop offset="100%" stopColor={last >= 0 ? "#2DB574" : "#E15560"} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke="var(--border-subtle)" strokeWidth="1" />
      <polygon points={fillPts} fill="url(#eq-grad)" />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function DrawdownChart({ data }: { data: { date: string; drawdown: number; drawdown_pct: number }[] }) {
  if (data.length < 2) return null;
  const hasDD = data.some(d => d.drawdown < 0);
  if (!hasDD) return (
    <div style={{ height: 100, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--gain)" }}>
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
  const fillPts = `${PAD},${H - PAD} ${pts.join(" ")} ${W - PAD},${H - PAD}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 100 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="dd-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E15560" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#E15560" stopOpacity="0.04" />
        </linearGradient>
      </defs>
      <polygon points={fillPts} fill="url(#dd-grad)" />
      <polyline points={pts.join(" ")} fill="none" stroke="var(--loss)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

type PanelMode = "add" | "close" | "view" | null;
type Tab = "trades" | "analytics" | "ai";

const inputStyle: React.CSSProperties = {
  width: "100%", borderRadius: "var(--radius-sm)", padding: "7px 10px", fontSize: 13,
  background: "var(--surface-3)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", outline: "none",
};

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

  const [symbolQ, setSymbolQ] = useState("");
  const [symbolResults, setSymbolResults] = useState<SymbolSearchResult[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState("");

  const [addForm, setAddForm] = useState<Partial<CreateJournalEntry>>({
    trade_type: "long",
    entry_date: new Date().toISOString().split("T")[0],
  });
  const [closeForm, setCloseForm] = useState<Partial<UpdateJournalEntry>>({
    exit_date: new Date().toISOString().split("T")[0],
  });
  const [closeSetupType, setCloseSetupType] = useState("");

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = filterStatus === "all" ? {} : { status: filterStatus };
      const [e, s, a] = await Promise.all([getJournalEntries(params), getJournalStats(), getJournalAnalytics()]);
      setEntries(e.entries);
      setJournalPlan(e.plan ?? null);
      setStats(s);
      setAnalytics(a);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [filterStatus]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    getBrokerStatus().then(s => { setBrokerConnected(s.connected); setBrokerName(s.broker); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab !== "ai" || patterns !== null) return;
    setPatternsLoading(true);
    getAiPatterns().then(setPatterns).catch(() => {}).finally(() => setPatternsLoading(false));
  }, [tab, patterns]);

  useEffect(() => {
    if (symbolQ.length < 1) { setSymbolResults([]); return; }
    const t = setTimeout(async () => {
      const r = await searchSymbols(symbolQ);
      setSymbolResults(r.slice(0, 6));
    }, 250);
    return () => clearTimeout(t);
  }, [symbolQ]);

  const tradeValue = addForm.entry_price && addForm.quantity ? addForm.entry_price * addForm.quantity : null;
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

  const pnlPreview = selectedEntry && closeForm.exit_price
    ? (() => {
        const ep = selectedEntry.entry_price;
        const xp = closeForm.exit_price;
        const qty = selectedEntry.quantity;
        return selectedEntry.trade_type === "long" ? (xp - ep) * qty : (ep - xp) * qty;
      })()
    : null;

  const handleAddTrade = async () => {
    if (!selectedSymbol || !addForm.entry_price || !addForm.quantity || !addForm.entry_date || !addForm.trade_type) {
      showToast("Fill in symbol, date, price and quantity"); return;
    }
    setSaving(true);
    try {
      await createJournalEntry({ ...addForm, symbol: selectedSymbol } as CreateJournalEntry);
      setAddForm({ trade_type: "long", entry_date: new Date().toISOString().split("T")[0] });
      setSelectedSymbol(""); setSymbolQ(""); setPanelMode(null);
      showToast("Trade logged"); load();
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : "Failed to save"); }
    finally { setSaving(false); }
  };

  const handleCloseTrade = async () => {
    if (!selectedEntry || !closeForm.exit_price || !closeForm.exit_date) {
      showToast("Fill exit date and price"); return;
    }
    setSaving(true);
    try {
      await updateJournalEntry(selectedEntry.id, { ...closeForm, ...(closeSetupType ? { setup_type: closeSetupType } : {}) } as UpdateJournalEntry);
      setPanelMode(null); setSelectedEntry(null);
      showToast("Trade closed — AI analysing…"); load();
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : "Failed to close"); }
    finally { setSaving(false); }
  };

  const handleGetLesson = async (entry: JournalEntry) => {
    setLessonLoading(entry.id);
    try {
      const updated = await triggerTradeLesson(entry.id);
      setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
      if (selectedEntry?.id === updated.id) setSelectedEntry(updated);
      showToast("AI lesson generated");
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : "AI lesson failed"); }
    finally { setLessonLoading(null); }
  };

  const handleImportZerodha = async () => {
    setImporting(true);
    try {
      const r = await importZerodhaTrades();
      showToast(r.message);
      if (r.imported > 0) load();
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : "Import failed"); }
    finally { setImporting(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this trade?")) return;
    await deleteJournalEntry(id);
    if (selectedEntry?.id === id) { setSelectedEntry(null); setPanelMode(null); }
    showToast("Deleted"); load();
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
    setSelectedSymbol(""); setSymbolQ(""); setPanelMode("add");
  };

  return (
    <div style={{ minHeight: "100%", background: "transparent", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 88, left: "50%", transform: "translateX(-50%)", zIndex: 50, fontSize: 13, padding: "10px 16px", borderRadius: 16, boxShadow: "var(--shadow-panel)", background: "linear-gradient(180deg, rgba(20,29,33,0.96), rgba(13,20,24,0.96))", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" }}>
          {toast}
        </div>
      )}

      <div style={{ height: 44, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", background: "var(--surface-1)", border: "1px solid var(--border-default)", borderRadius: 8, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Journal</span>
          <div style={{ display: "flex", gap: 4 }}>
            {([ { id: "trades", label: "Trades" }, { id: "analytics", label: "Analytics" }, { id: "ai", label: "AI" } ] as { id: Tab; label: string }[]).map(({ id, label }) => (
              <button key={id} onClick={() => setTab(id)} style={{
                padding: "3px 10px", fontSize: 12, fontWeight: 500, cursor: "pointer", borderRadius: 6,
                background: tab === id ? "rgba(255,255,255,0.08)" : "transparent",
                color: tab === id ? "var(--text-primary)" : "var(--text-tertiary)",
                border: tab === id ? "1px solid var(--border-default)" : "1px solid transparent",
              }}>{label}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {brokerConnected && brokerName === "zerodha" && (
            <button onClick={handleImportZerodha} disabled={importing} style={{ padding: "5px 10px", fontSize: 11, fontWeight: 500, borderRadius: 6, border: "1px solid var(--border-default)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", opacity: importing ? 0.5 : 1 }}>
              {importing ? "Importing…" : "Import Zerodha"}
            </button>
          )}
          <button onClick={openAddPanel} style={{ padding: "5px 12px", fontSize: 11, fontWeight: 600, borderRadius: 6, background: "linear-gradient(180deg, var(--accent-strong), var(--accent))", color: "#0A1712", cursor: "pointer", border: "none" }}>
            + Log trade
          </button>
        </div>
      </div>

      {/* Stat cards — shown on trades + analytics tabs only */}
      {tab !== "ai" && <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
        <StatCard
          label="Total P&L"
          value={stats ? fmtCcy(stats.total_pnl) : "—"}
          deltaVariant={stats ? (stats.total_pnl >= 0 ? "gain" : "loss") : "neutral"}
        />
        <StatCard
          label="Win rate"
          value={stats ? `${stats.win_rate}%` : "—"}
          deltaVariant={stats ? (stats.win_rate >= 50 ? "gain" : "loss") : "neutral"}
        />
        <StatCard label="Closed trades" value={String(stats?.total_trades ?? "—")} />
        <StatCard label="Open trades" value={String(stats?.open_trades ?? "—")} />
      </div>}

      {/* ── Analytics ── */}
      {tab === "analytics" && (
        <div>
          <Card padding="lg">
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {/* Equity curve */}
              <div>
                <h2 className="heading-card" style={{ marginBottom: 4 }}>Equity curve</h2>
                <div className="caption" style={{ marginBottom: 12 }}>Cumulative P&amp;L across closed trades</div>
                <EquityCurve data={analytics?.equity_curve ?? []} />
              </div>

              {/* Monthly P&L */}
              {(analytics?.monthly_pnl?.length ?? 0) > 0 && (
                <div>
                  <h2 className="heading-card" style={{ marginBottom: 12 }}>Monthly P&amp;L</h2>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {analytics!.monthly_pnl.map(m => {
                      const pos = m.pnl >= 0;
                      return (
                        <div key={m.month} style={{ flex: "1 1 80px", minWidth: 80, borderRadius: "var(--radius-md)", padding: "10px 12px", textAlign: "center", background: pos ? "var(--gain-subtle)" : "var(--loss-subtle)" }}>
                          <div className="mono" style={{ fontSize: 11, fontWeight: 600, color: pos ? "var(--gain)" : "var(--loss)" }}>
                            {m.pnl >= 0 ? "+" : ""}₹{Math.abs(m.pnl).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                          </div>
                          <div className="caption" style={{ marginTop: 2 }}>{m.month}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Setup breakdown */}
              {(analytics?.setup_breakdown?.length ?? 0) > 0 && (
                <div>
                  <h2 className="heading-card" style={{ marginBottom: 12 }}>Performance by setup</h2>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                          {["Setup", "Trades", "Win rate", "Avg P&L", "Total P&L"].map(h => (
                            <th key={h} className="label" style={{ textAlign: "left", paddingBottom: 8, paddingRight: 16 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {analytics!.setup_breakdown.map(s => {
                          const pos = s.total_pnl >= 0;
                          return (
                            <tr key={s.setup} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                              <td style={{ padding: "10px 16px 10px 0", color: "var(--text-primary)", fontWeight: 500 }}>{s.setup}</td>
                              <td style={{ padding: "10px 16px 10px 0", color: "var(--text-secondary)" }}>{s.trades}</td>
                              <td style={{ padding: "10px 16px 10px 0" }}>
                                <span className="mono" style={{ fontWeight: 600, color: s.win_rate >= 50 ? "var(--gain)" : "var(--loss)" }}>{s.win_rate}%</span>
                              </td>
                              <td style={{ padding: "10px 16px 10px 0" }}>
                                <span className="mono" style={{ color: s.avg_pnl >= 0 ? "var(--gain)" : "var(--loss)" }}>
                                  {s.avg_pnl >= 0 ? "+" : ""}₹{Math.abs(s.avg_pnl).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                                </span>
                              </td>
                              <td style={{ padding: "10px 0" }}>
                                <span className="mono" style={{ fontWeight: 600, color: pos ? "var(--gain)" : "var(--loss)" }}>
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

              {/* Drawdown */}
              {(analytics?.drawdown_curve?.length ?? 0) > 1 && (
                <div>
                  <h2 className="heading-card" style={{ marginBottom: 4 }}>Drawdown</h2>
                  <div className="caption" style={{ marginBottom: 10 }}>Underwater equity relative to all-time high</div>
                  <DrawdownChart data={analytics!.drawdown_curve} />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 12 }}>
                    {[
                      { label: "Max drawdown", val: analytics!.max_drawdown != null ? `₹${analytics!.max_drawdown.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "—", neg: true },
                      { label: "Longest DD", val: analytics!.longest_dd_days ? `${analytics!.longest_dd_days}d` : "—", neg: true },
                      { label: "Recovery factor", val: analytics!.recovery_factor != null ? analytics!.recovery_factor.toFixed(2) : "—", neg: analytics!.recovery_factor != null && analytics!.recovery_factor < 1 },
                      { label: "Profit factor", val: analytics!.profit_factor != null ? analytics!.profit_factor.toFixed(2) : "—", neg: analytics!.profit_factor != null && analytics!.profit_factor < 1 },
                    ].map(item => (
                      <div key={item.label} style={{ borderRadius: "var(--radius-md)", padding: "10px 12px", textAlign: "center", background: "var(--surface-2)" }}>
                        <div className="mono" style={{ fontSize: 15, fontWeight: 600, color: item.neg ? "var(--loss)" : "var(--gain)" }}>{item.val}</div>
                        <div className="caption" style={{ marginTop: 4 }}>{item.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!analytics?.setup_breakdown?.length && !analytics?.equity_curve?.length && (
                <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-tertiary)", fontSize: 13 }}>
                  Close some trades to see analytics here.
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ── AI Analysis ── */}
      {tab === "ai" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Pattern stats */}
          <Card padding="lg">
            <h2 className="heading-card" style={{ marginBottom: 4 }}>Pattern stats</h2>
            <div className="body-secondary" style={{ marginBottom: 16 }}>Computed from your closed trades — no AI needed.</div>

            {patternsLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[1,2,3].map(i => <div key={i} style={{ height: 40, borderRadius: "var(--radius-md)", background: "var(--surface-3)" }} />)}
              </div>
            ) : !patterns?.ready ? (
              <div style={{ textAlign: "center", padding: "24px 0", fontSize: 12, color: "var(--text-tertiary)" }}>
                Close at least {patterns?.min_trades_required ?? 3} trades to see pattern stats.
                {patterns?.trades_available != null && patterns.trades_available > 0 && (
                  <span style={{ display: "block", marginTop: 4 }}>You have {patterns.trades_available} so far.</span>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Holding period */}
                {(patterns.avg_hold_winners != null || patterns.avg_hold_losers != null) && (
                  <div>
                    <div className="label" style={{ marginBottom: 8 }}>Avg holding period</div>
                    <div style={{ display: "flex", gap: 12 }}>
                      {patterns.avg_hold_winners != null && (
                        <div style={{ flex: 1, borderRadius: "var(--radius-md)", padding: "10px 12px", textAlign: "center", background: "var(--gain-subtle)" }}>
                          <div className="mono" style={{ fontSize: 16, fontWeight: 600, color: "var(--gain)" }}>{patterns.avg_hold_winners}d</div>
                          <div className="caption" style={{ marginTop: 4 }}>Winners</div>
                        </div>
                      )}
                      {patterns.avg_hold_losers != null && (
                        <div style={{ flex: 1, borderRadius: "var(--radius-md)", padding: "10px 12px", textAlign: "center", background: "var(--loss-subtle)" }}>
                          <div className="mono" style={{ fontSize: 16, fontWeight: 600, color: "var(--loss)" }}>{patterns.avg_hold_losers}d</div>
                          <div className="caption" style={{ marginTop: 4 }}>Losers</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Day of week */}
                {(patterns.day_of_week?.length ?? 0) > 0 && (
                  <div>
                    <div className="label" style={{ marginBottom: 8 }}>Win rate by day</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {patterns.day_of_week!.map(d => (
                        <div key={d.day} style={{ flex: "1 1 60px", minWidth: 60, borderRadius: "var(--radius-md)", padding: "8px 8px", textAlign: "center", border: "1px solid var(--border-subtle)" }}>
                          <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: d.win_rate >= 60 ? "var(--gain)" : d.win_rate >= 40 ? "var(--warn)" : "var(--loss)" }}>
                            {d.win_rate}%
                          </div>
                          <div className="caption" style={{ marginTop: 2 }}>{d.day.slice(0, 3)}</div>
                          <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>{d.trades}t</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Holding period buckets */}
                {(patterns.by_holding_period?.length ?? 0) > 0 && (
                  <div>
                    <div className="label" style={{ marginBottom: 8 }}>Win rate by holding period</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {patterns.by_holding_period!.map(b => (
                        <div key={b.bucket} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ flex: "0 0 110px", fontSize: 11, color: "var(--text-secondary)" }}>{b.bucket}</span>
                          <div style={{ flex: 1, height: 6, background: "var(--surface-3)", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${b.win_rate}%`, background: b.win_rate >= 60 ? "var(--gain)" : b.win_rate >= 40 ? "var(--warn)" : "var(--loss)", transition: "width 600ms var(--ease-out)" }} />
                          </div>
                          <span className="mono" style={{ fontSize: 12, fontWeight: 600, flex: "0 0 36px", textAlign: "right", color: b.win_rate >= 60 ? "var(--gain)" : b.win_rate >= 40 ? "var(--warn)" : "var(--loss)" }}>
                            {b.win_rate}%
                          </span>
                          <span style={{ fontSize: 10, color: "var(--text-tertiary)", flex: "0 0 24px" }}>{b.trades}t</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Long vs Short */}
                {(patterns.by_direction?.length ?? 0) > 0 && (
                  <div>
                    <div className="label" style={{ marginBottom: 8 }}>Long vs short</div>
                    <div style={{ display: "flex", gap: 12 }}>
                      {patterns.by_direction!.map(d => (
                        <div key={d.direction} style={{ flex: 1, borderRadius: "var(--radius-md)", padding: "10px 12px", border: "1px solid var(--border-subtle)" }}>
                          <div className="mono" style={{ fontSize: 14, fontWeight: 600, color: d.win_rate >= 50 ? "var(--gain)" : "var(--loss)" }}>{d.win_rate}%</div>
                          <div style={{ fontSize: 11, marginTop: 2, color: "var(--text-secondary)" }}>{d.direction} · {d.trades} trades</div>
                          <div className="mono" style={{ fontSize: 11, marginTop: 2, color: d.total_pnl >= 0 ? "var(--gain)" : "var(--loss)" }}>
                            {d.total_pnl >= 0 ? "+" : ""}₹{Math.abs(d.total_pnl).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* AI deep analysis */}
          <Card padding="lg">
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <h2 className="heading-card" style={{ marginBottom: 4 }}>AI deep analysis</h2>
                <div className="body-secondary">Claude reads your full journal and surfaces mistakes, patterns, and rules to add to your playbook.</div>
              </div>
              <button
                onClick={async () => {
                  setAiLoading(true); setAiError(""); setAiAnalysis(null);
                  try {
                    const r = await analyseJournal();
                    setAiAnalysis(r.analysis); setAiTradesCount(r.trades_analysed);
                  } catch (e: unknown) { setAiError(e instanceof Error ? e.message : "Analysis failed"); }
                  finally { setAiLoading(false); }
                }}
                disabled={aiLoading}
                style={{ flexShrink: 0, padding: "7px 14px", borderRadius: "var(--radius-sm)", fontSize: 12, fontWeight: 700, background: "linear-gradient(180deg, var(--accent-strong), var(--accent))", color: "#04120d", border: "1px solid rgba(86,215,193,0.24)", cursor: "pointer", opacity: aiLoading ? 0.5 : 1, marginLeft: 16 }}
              >
                {aiLoading ? "Analysing…" : aiAnalysis ? "Re-analyse" : "Analyse my trades"}
              </button>
            </div>

            {aiError && (
              <div style={{ fontSize: 13, color: "var(--loss)", background: "var(--loss-subtle)", border: "1px solid rgba(225,85,96,0.2)", borderRadius: "var(--radius-md)", padding: "10px 14px", marginBottom: 12 }}>
                {aiError}
              </div>
            )}

            {aiLoading && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 0", gap: 12 }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", border: "2px solid var(--surface-3)", borderTopColor: "var(--accent)", animation: "spin 1s linear infinite" }}>
                  <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                </div>
                <div className="caption">Reading your journal and finding patterns…</div>
              </div>
            )}

            {aiAnalysis && !aiLoading && (
              <div>
                <div className="caption" style={{ marginBottom: 12 }}>Based on {aiTradesCount} closed trades</div>
                <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: "var(--radius-md)", fontSize: 11, lineHeight: 1.6, background: "var(--warn-subtle)", border: "1px solid rgba(232,163,59,0.25)", color: "var(--warn)" }}>
                  AI analysis is for educational purposes only and does not constitute SEBI-registered investment advice.
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-primary)" }}>
                  {aiAnalysis.split("\n").map((line, i) => {
                    if (line.startsWith("## ") || line.startsWith("### ")) {
                      return <div key={i} style={{ fontSize: 13, fontWeight: 700, marginTop: 16, marginBottom: 4, color: "var(--text-primary)" }}>{line.replace(/^#+\s/, "")}</div>;
                    }
                    if (line.startsWith("**") && line.endsWith("**")) {
                      return <div key={i} style={{ fontSize: 13, fontWeight: 700, marginTop: 12, marginBottom: 4 }}>{line.replace(/\*\*/g, "")}</div>;
                    }
                    if (line.startsWith("- ") || line.startsWith("* ")) {
                      return (
                        <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 4 }}>
                          <span style={{ color: "var(--accent)", flexShrink: 0, marginTop: 2 }}>•</span>
                          <span dangerouslySetInnerHTML={{ __html: line.slice(2).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />
                        </div>
                      );
                    }
                    if (line.trim() === "") return <div key={i} style={{ height: 6 }} />;
                    return <div key={i} dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />;
                  })}
                </div>
              </div>
            )}

            {!aiAnalysis && !aiLoading && !aiError && (
              <div style={{ textAlign: "center", padding: "32px 0" }}>
                <div className="body-secondary">Click &quot;Analyse my trades&quot; to get AI-powered insights on your trading patterns.</div>
                <div className="caption" style={{ marginTop: 4 }}>Requires at least 3 closed trades.</div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── Trades ── */}
      {tab === "trades" && (
        <div style={{ display: "flex", gap: 20 }}>
          {/* Trade list */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Toolbar */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{ display: "flex", borderRadius: "var(--radius-sm)", padding: 2, gap: 2, background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}>
                {(["all", "open", "closed"] as const).map(s => (
                  <button key={s} onClick={() => setFilterStatus(s)}
                    style={{
                      padding: "4px 12px", fontSize: 12, borderRadius: "var(--radius-sm)", cursor: "pointer", textTransform: "capitalize",
                      background: filterStatus === s ? "var(--accent)" : "transparent",
                      color: filterStatus === s ? "#0A1712" : "var(--text-tertiary)",
                      fontWeight: filterStatus === s ? 600 : 400,
                      transition: "all var(--motion-instant) var(--ease-out)",
                    }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Free plan notice */}
            {journalPlan === "free" && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: "var(--radius-md)", marginBottom: 12, fontSize: 12, background: "var(--warn-subtle)", border: "1px solid rgba(232,163,59,0.2)" }}>
                <span style={{ color: "var(--warn)" }}>Free plan shows last 3 months of trades only.</span>
                <a href="/settings/billing" style={{ fontWeight: 600, color: "var(--accent)", marginLeft: 16 }}>Upgrade to Pro</a>
              </div>
            )}

            {/* Table */}
            <div style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01)), var(--surface-1)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 22, overflow: "hidden", boxShadow: "var(--shadow-panel)" }}>
              <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)" }}>
                    {["Symbol", "Type", "Entry", "Entry px", "Exit px", "P&L", "Status", ""].map(h => (
                      <th key={h} className="label" style={{ textAlign: "left", padding: "10px 12px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        {Array.from({ length: 8 }).map((__, j) => (
                          <td key={j} style={{ padding: "10px 12px" }}>
                            <div style={{ height: 14, borderRadius: "var(--radius-sm)", background: "var(--surface-3)", width: 60 }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : entries.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: "48px 0", textAlign: "center" }}>
                        <div className="body-secondary">No trades yet.</div>
                        <button onClick={openAddPanel} style={{ marginTop: 8, fontSize: 13, color: "var(--accent)", cursor: "pointer" }}>
                          Log your first trade
                        </button>
                      </td>
                    </tr>
                  ) : (
                    entries.map(e => (
                      <tr key={e.id}
                        onClick={() => { setSelectedEntry(e); setPanelMode("view"); }}
                        style={{
                          borderBottom: "1px solid var(--border-subtle)",
                          background: selectedEntry?.id === e.id ? "var(--accent-subtle)" : "transparent",
                          cursor: "pointer",
                          transition: "background var(--motion-instant) var(--ease-out)",
                        }}
                        onMouseEnter={ev => { if (selectedEntry?.id !== e.id) (ev.currentTarget as HTMLElement).style.background = "var(--surface-2)"; }}
                        onMouseLeave={ev => { if (selectedEntry?.id !== e.id) (ev.currentTarget as HTMLElement).style.background = "transparent"; }}
                      >
                        <td style={{ padding: "10px 12px" }}>
                          <span className="mono" style={{ fontWeight: 600, color: "var(--text-primary)" }}>{e.symbol}</span>
                          {e.setup_type && <span className="caption" style={{ marginLeft: 6 }}>{e.setup_type}</span>}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <Badge variant={e.trade_type === "long" ? "gain" : "loss"}>
                            {e.trade_type === "long" ? "L" : "S"}
                          </Badge>
                        </td>
                        <td style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>{fmtDate(e.entry_date)}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <span className="mono" style={{ fontWeight: 500, color: "var(--text-primary)" }}>₹{e.entry_price.toLocaleString("en-IN")}</span>
                        </td>
                        <td style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>
                          <span className="mono">{e.exit_price ? `₹${e.exit_price.toLocaleString("en-IN")}` : "—"}</span>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          {e.pnl == null ? (
                            <span className="caption">Open</span>
                          ) : (
                            <span className="mono" style={{ fontSize: 12, fontWeight: 600, padding: "2px 6px", borderRadius: "var(--radius-sm)", color: e.pnl >= 0 ? "var(--gain)" : "var(--loss)", background: e.pnl >= 0 ? "var(--gain-subtle)" : "var(--loss-subtle)" }}>
                              {e.pnl >= 0 ? "+" : ""}{fmtCcy(e.pnl)}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          {e.status === "open" ? (
                            <Badge variant="accent">Open</Badge>
                          ) : e.pnl != null ? (
                            <Badge variant={e.pnl >= 0 ? "gain" : "loss"}>{e.pnl >= 0 ? "Win" : "Loss"}</Badge>
                          ) : (
                            <Badge variant="neutral">{e.status}</Badge>
                          )}
                        </td>
                        <td style={{ padding: "10px 12px" }} onClick={ev => ev.stopPropagation()}>
                          <div style={{ display: "flex", gap: 8 }}>
                            {e.status === "open" && (
                              <button onClick={() => openClosePanel(e)} style={{ fontSize: 11, color: "var(--accent)", cursor: "pointer" }}>
                                Close
                              </button>
                            )}
                            <button onClick={() => handleDelete(e.id)} style={{ fontSize: 11, color: "var(--text-tertiary)", cursor: "pointer" }}>×</button>
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
            <div style={{ width: 340, flexShrink: 0 }}>
              <Card padding="lg" style={{ borderRadius: 22 }}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <div className="heading-card">
                    {panelMode === "add" ? "Log trade" : panelMode === "close" ? `Close ${selectedEntry?.symbol}` : selectedEntry?.symbol}
                  </div>
                  <button onClick={() => { setPanelMode(null); setSelectedEntry(null); }} style={{ fontSize: 18, lineHeight: 1, color: "var(--text-tertiary)" }}>×</button>
                </div>

                {/* ── ADD FORM ── */}
                {panelMode === "add" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ position: "relative" }}>
                      <div className="label" style={{ marginBottom: 6 }}>Symbol</div>
                      <input
                        value={selectedSymbol || symbolQ}
                        onChange={ev => { setSelectedSymbol(""); setSymbolQ(ev.target.value.toUpperCase()); }}
                        placeholder="e.g. RELIANCE"
                        style={inputStyle}
                      />
                      {symbolResults.length > 0 && !selectedSymbol && (
                        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-modal)", zIndex: 20, overflow: "hidden", marginTop: 2, background: "var(--surface-float)", border: "1px solid var(--border-subtle)" }}>
                          {symbolResults.map(r => (
                            <button key={r.symbol} onClick={() => { setSelectedSymbol(r.symbol); setSymbolQ(r.symbol); setSymbolResults([]); }}
                              style={{ width: "100%", textAlign: "left", padding: "8px 12px", fontSize: 13, borderBottom: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}>
                              <span style={{ fontWeight: 500 }}>{r.symbol}</span>
                              <span className="caption" style={{ marginLeft: 8 }}>{r.company_name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="label" style={{ marginBottom: 6 }}>Direction</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {(["long", "short"] as const).map(t => (
                          <button key={t} onClick={() => setAddForm(f => ({ ...f, trade_type: t }))}
                            style={{
                              flex: 1, padding: "7px 0", borderRadius: "var(--radius-sm)", fontSize: 13, fontWeight: 500, cursor: "pointer", textTransform: "capitalize",
                              background: addForm.trade_type === t ? (t === "long" ? "var(--gain-subtle)" : "var(--loss-subtle)") : "var(--surface-3)",
                              color: addForm.trade_type === t ? (t === "long" ? "var(--gain)" : "var(--loss)") : "var(--text-secondary)",
                              border: `1px solid ${addForm.trade_type === t ? (t === "long" ? "var(--gain)" : "var(--loss)") : "var(--border-subtle)"}`,
                            }}>
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="label" style={{ marginBottom: 6 }}>Entry date</div>
                      <input type="date" value={addForm.entry_date || ""} onChange={ev => setAddForm(f => ({ ...f, entry_date: ev.target.value }))} style={inputStyle} />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div>
                        <div className="label" style={{ marginBottom: 6 }}>Entry price ₹</div>
                        <input type="number" value={addForm.entry_price || ""} onChange={ev => setAddForm(f => ({ ...f, entry_price: parseFloat(ev.target.value) || undefined }))} placeholder="0.00" style={inputStyle} />
                      </div>
                      <div>
                        <div className="label" style={{ marginBottom: 6 }}>Quantity</div>
                        <input type="number" value={addForm.quantity || ""} onChange={ev => setAddForm(f => ({ ...f, quantity: parseInt(ev.target.value) || undefined }))} placeholder="0" style={inputStyle} />
                      </div>
                    </div>

                    {tradeValue && <div className="caption">Trade value: ₹{tradeValue.toLocaleString("en-IN")}</div>}

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div>
                        <div className="label" style={{ marginBottom: 6 }}>Stop loss ₹</div>
                        <input type="number" value={addForm.stop_loss || ""} onChange={ev => setAddForm(f => ({ ...f, stop_loss: parseFloat(ev.target.value) || undefined }))} placeholder="optional" style={inputStyle} />
                      </div>
                      <div>
                        <div className="label" style={{ marginBottom: 6 }}>Target ₹</div>
                        <input type="number" value={addForm.target_price || ""} onChange={ev => setAddForm(f => ({ ...f, target_price: parseFloat(ev.target.value) || undefined }))} placeholder="optional" style={inputStyle} />
                      </div>
                    </div>

                    {(riskRupees || rrRatio) && (
                      <div className="caption" style={{ display: "flex", gap: 12 }}>
                        {riskRupees && <span>Risk: ₹{riskRupees.toLocaleString("en-IN")}</span>}
                        {rrRatio && (
                          <span style={{ fontWeight: 600, color: parseFloat(rrRatio) >= 2 ? "var(--gain)" : "var(--warn)" }}>
                            R:R = 1:{rrRatio} {parseFloat(rrRatio) >= 2 ? "" : "— below 2:1"}
                          </span>
                        )}
                      </div>
                    )}

                    <div>
                      <div className="label" style={{ marginBottom: 8 }}>Setup</div>
                      <SetupChips value={addForm.setup_type || ""} onChange={v => setAddForm(f => ({ ...f, setup_type: v || undefined }))} />
                    </div>

                    <div>
                      <div className="label" style={{ marginBottom: 6 }}>Why are you entering?</div>
                      <textarea value={addForm.entry_reason || ""} onChange={ev => setAddForm(f => ({ ...f, entry_reason: ev.target.value }))} rows={3} placeholder="EMA alignment, volume surge, breakout of resistance…" style={{ ...inputStyle, resize: "none" }} />
                    </div>

                    <button onClick={handleAddTrade} disabled={saving}
                      style={{ width: "100%", padding: "9px 0", fontSize: 13, fontWeight: 700, borderRadius: "var(--radius-sm)", background: "linear-gradient(180deg, var(--accent-strong), var(--accent))", color: "#04120d", border: "1px solid rgba(86,215,193,0.24)", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.5 : 1 }}>
                      {saving ? "Saving…" : "Save trade"}
                    </button>
                  </div>
                )}

                {/* ── CLOSE FORM ── */}
                {panelMode === "close" && selectedEntry && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div className="body-secondary" style={{ paddingBottom: 10, borderBottom: "1px solid var(--border-subtle)" }}>
                      {selectedEntry.trade_type === "long" ? "Long" : "Short"} · {selectedEntry.quantity} qty · Entered ₹{selectedEntry.entry_price.toLocaleString("en-IN")} on {fmtDate(selectedEntry.entry_date)}
                    </div>

                    <div>
                      <div className="label" style={{ marginBottom: 6 }}>Exit date</div>
                      <input type="date" value={closeForm.exit_date || ""} onChange={ev => setCloseForm(f => ({ ...f, exit_date: ev.target.value }))} style={inputStyle} />
                    </div>

                    <div>
                      <div className="label" style={{ marginBottom: 6 }}>Exit price ₹</div>
                      <input type="number" value={closeForm.exit_price || ""} onChange={ev => setCloseForm(f => ({ ...f, exit_price: parseFloat(ev.target.value) || undefined }))} placeholder="0.00" style={inputStyle} />
                    </div>

                    {pnlPreview != null && (
                      <div style={{ fontSize: 13, fontWeight: 600, padding: "8px 12px", borderRadius: "var(--radius-sm)", color: pnlPreview >= 0 ? "var(--gain)" : "var(--loss)", background: pnlPreview >= 0 ? "var(--gain-subtle)" : "var(--loss-subtle)" }}>
                        <span className="mono">P&L: {pnlPreview >= 0 ? "+" : ""}{fmtCcy(pnlPreview)} ({((pnlPreview / (selectedEntry.entry_price * selectedEntry.quantity)) * 100).toFixed(2)}%)</span>
                      </div>
                    )}

                    <div>
                      <div className="label" style={{ marginBottom: 8 }}>Setup</div>
                      <SetupChips value={closeSetupType} onChange={setCloseSetupType} />
                    </div>

                    <div>
                      <div className="label" style={{ marginBottom: 6 }}>Why did you exit?</div>
                      <textarea value={closeForm.exit_reason || ""} onChange={ev => setCloseForm(f => ({ ...f, exit_reason: ev.target.value }))} rows={2} placeholder="Target hit, stop loss, chart breakdown…" style={{ ...inputStyle, resize: "none" }} />
                    </div>

                    <div>
                      <div className="label" style={{ marginBottom: 6 }}>What went wrong?</div>
                      <textarea value={closeForm.mistakes || ""} onChange={ev => setCloseForm(f => ({ ...f, mistakes: ev.target.value }))} rows={2} placeholder="Sized too large, ignored stop…" style={{ ...inputStyle, resize: "none" }} />
                    </div>

                    <div>
                      <div className="label" style={{ marginBottom: 6 }}>What did I learn?</div>
                      <textarea value={closeForm.lessons || ""} onChange={ev => setCloseForm(f => ({ ...f, lessons: ev.target.value }))} rows={2} placeholder="Always wait for confirmation…" style={{ ...inputStyle, resize: "none" }} />
                    </div>

                    <button onClick={handleCloseTrade} disabled={saving}
                      style={{ width: "100%", padding: "9px 0", fontSize: 13, fontWeight: 700, borderRadius: "var(--radius-sm)", background: "linear-gradient(180deg, var(--accent-strong), var(--accent))", color: "#04120d", border: "1px solid rgba(86,215,193,0.24)", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.5 : 1 }}>
                      {saving ? "Saving…" : "Close trade"}
                    </button>
                  </div>
                )}

                {/* ── VIEW ── */}
                {panelMode === "view" && selectedEntry && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 12 }}>
                      {[
                        ["Direction", selectedEntry.trade_type === "long" ? "Long" : "Short"],
                        ["Setup", selectedEntry.setup_type || "—"],
                        ["Entry date", fmtDate(selectedEntry.entry_date)],
                        ["Exit date", fmtDate(selectedEntry.exit_date)],
                        ["Entry price", `₹${selectedEntry.entry_price.toLocaleString("en-IN")}`],
                        ["Exit price", selectedEntry.exit_price ? `₹${selectedEntry.exit_price.toLocaleString("en-IN")}` : "—"],
                        ["Quantity", selectedEntry.quantity.toLocaleString("en-IN")],
                        ["Holding days", String(selectedEntry.holding_days ?? "—")],
                        ["Stop loss", selectedEntry.stop_loss ? `₹${selectedEntry.stop_loss.toLocaleString("en-IN")}` : "—"],
                        ["Target", selectedEntry.target_price ? `₹${selectedEntry.target_price.toLocaleString("en-IN")}` : "—"],
                        ["R:R", String(selectedEntry.risk_reward ?? "—")],
                        ["P&L", selectedEntry.pnl != null ? fmtCcy(selectedEntry.pnl) : "Open"],
                      ].map(([k, v]) => (
                        <div key={k}>
                          <div className="label" style={{ marginBottom: 2 }}>{k}</div>
                          <div style={{ fontWeight: 500, color: "var(--text-primary)", fontSize: 13 }}>{v}</div>
                        </div>
                      ))}
                    </div>

                    {selectedEntry.entry_reason && (
                      <div>
                        <div className="label" style={{ marginBottom: 4 }}>Entry reason</div>
                        <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-secondary)" }}>{selectedEntry.entry_reason}</p>
                      </div>
                    )}

                    {selectedEntry.exit_reason && (
                      <div>
                        <div className="label" style={{ marginBottom: 4 }}>Exit reason</div>
                        <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-secondary)" }}>{selectedEntry.exit_reason}</p>
                      </div>
                    )}

                    {selectedEntry.mistakes && (
                      <div>
                        <div className="label" style={{ marginBottom: 4 }}>Mistakes</div>
                        <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--loss)" }}>{selectedEntry.mistakes}</p>
                      </div>
                    )}

                    {selectedEntry.lessons ? (
                      <div style={{ borderRadius: "var(--radius-md)", padding: "12px 14px", background: "var(--gain-subtle)", border: "1px solid rgba(45,181,116,0.2)" }}>
                        <div className="label" style={{ marginBottom: 8, color: "var(--gain)" }}>AI lesson</div>
                        {selectedEntry.lessons.split("\n").map((line, i) => {
                          if (!line.trim()) return null;
                          const clean = line.replace(/^[-•*]\s*/, "").replace(/\*\*(.*?)\*\*/g, "$1");
                          return (
                            <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, lineHeight: 1.6, marginBottom: 4, color: "var(--text-secondary)" }}>
                              <span style={{ color: "var(--gain)", flexShrink: 0, marginTop: 2 }}>•</span>
                              <span>{clean}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : selectedEntry.status === "closed" && (
                      <button onClick={() => handleGetLesson(selectedEntry)} disabled={lessonLoading === selectedEntry.id}
                        style={{ width: "100%", padding: "8px 0", borderRadius: "var(--radius-sm)", fontSize: 12, fontWeight: 500, border: "1px solid var(--accent)", color: "var(--accent)", background: "transparent", cursor: "pointer", opacity: lessonLoading === selectedEntry.id ? 0.5 : 1 }}>
                        {lessonLoading === selectedEntry.id ? "Generating AI lesson…" : "Get AI lesson for this trade"}
                      </button>
                    )}

                    {selectedEntry.status === "open" && (
                      <button onClick={() => openClosePanel(selectedEntry)}
                        style={{ width: "100%", padding: "9px 0", fontSize: 13, fontWeight: 700, borderRadius: "var(--radius-sm)", background: "linear-gradient(180deg, var(--accent-strong), var(--accent))", color: "#04120d", border: "1px solid rgba(86,215,193,0.24)", cursor: "pointer" }}>
                        Close this trade
                      </button>
                    )}
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
