"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  getJournalEntries, getJournalStats, getJournalAnalytics,
  createJournalEntry, updateJournalEntry, deleteJournalEntry,
  searchSymbols, analyseJournal, getAiPatterns,
  triggerTradeLesson, importZerodhaTrades, getBrokerStatus,
} from "@/lib/api";
import type { JournalEntry, JournalStats, JournalAnalytics, CreateJournalEntry, UpdateJournalEntry, SymbolSearchResult, AiPatterns } from "@/lib/api";
import { StatCard } from "@/components/ui";
import { JournalStatusBar } from "./components/JournalStatusBar";
import { fmtCcy, getTradeFlowMeta } from "./components/utils";
import { TradeTable } from "./components/TradeTable";
import { TradePanel } from "./components/TradePanel";
import { JournalAnalytics as JournalAnalyticsTab } from "./components/JournalAnalytics";
import { JournalAiInsights } from "./components/JournalAiInsights";
import type { PanelMode, Tab } from "./components/types";
import { useWorkflowState } from "@/lib/workflow";

export default function JournalPage() {
  const searchParams = useSearchParams();
  const { completeReview } = useWorkflowState();
  const [tab, setTab] = useState<Tab>("trades");
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [journalPlan, setJournalPlan] = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiTradesCount, setAiTradesCount] = useState(0);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [autoAnalysisStarted] = useState(false);
  const [patterns, setPatterns] = useState<AiPatterns | null>(null);
  const [patternsLoading, setPatternsLoading] = useState(false);
  const [brokerConnected, setBrokerConnected] = useState(false);
  const [brokerName, setBrokerName] = useState<string | null>(null);
  const [brokerStatusLabel, setBrokerStatusLabel] = useState<string | null>(null);
  const [brokerCanImport, setBrokerCanImport] = useState(false);
  const [brokerLastSyncedAt, setBrokerLastSyncedAt] = useState<string | null>(null);
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
  const [symbolFocus, setSymbolFocus] = useState("");
  const [reviewFocus, setReviewFocus] = useState<"all" | "needs-review" | "reviewed">("all");

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = filterStatus === "all" ? {} : { status: filterStatus };
      const [e, s] = await Promise.all([getJournalEntries(params), getJournalStats()]);
      setEntries(e.entries);
      setJournalPlan(e.plan ?? null);
      setStats(s);
      getJournalAnalytics().then(setAnalytics).catch(() => {});
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [filterStatus]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (requestedTab === "analytics" || requestedTab === "ai" || requestedTab === "trades") {
      setTab(requestedTab);
    }
    const requestedSymbol = searchParams.get("symbol");
    setSymbolFocus(requestedSymbol?.toUpperCase() ?? "");
    const requestedReview = searchParams.get("review");
    if (requestedReview === "needs-review" || requestedReview === "reviewed") {
      setReviewFocus(requestedReview);
    } else {
      setReviewFocus("all");
    }
  }, [searchParams]);

  const refreshBrokerStatus = useCallback(() => {
    getBrokerStatus().then(s => {
      setBrokerConnected(s.connected);
      setBrokerName(s.broker);
      setBrokerStatusLabel(s.status_label ?? null);
      setBrokerCanImport(Boolean(s.can_import));
      setBrokerLastSyncedAt(s.last_synced_at ?? null);
    }).catch(() => {});
  }, []);

  useEffect(() => { refreshBrokerStatus(); }, [refreshBrokerStatus]);

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

  const closedTrades = stats?.total_trades ?? 0;
  const reviewedTrades = entries.filter(entry => entry.status === "closed" && Boolean(entry.lessons?.trim())).length;
  const reviewReady = closedTrades >= 3;
  const visibleEntries = useMemo(() => (
    entries.filter((entry) => {
      if (symbolFocus && entry.symbol !== symbolFocus) return false;
      if (reviewFocus === "needs-review") {
        return entry.status === "closed" && !entry.lessons?.trim();
      }
      if (reviewFocus === "reviewed") {
        return entry.status === "closed" && Boolean(entry.lessons?.trim());
      }
      return true;
    })
  ), [entries, reviewFocus, symbolFocus]);
  const journalQueue = useMemo(() => {
    const closed = entries.filter((entry) => entry.status === "closed");
    const needsReview = closed.filter((entry) => !entry.lessons?.trim()).length;
    const reviewed = closed.length - needsReview;
    const imported = entries.filter((entry) => getTradeFlowMeta(entry).sourceLabel === "Broker import").length;
    const chartOrders = entries.filter((entry) => getTradeFlowMeta(entry).sourceLabel === "Chart order").length;
    const manual = entries.length - imported - chartOrders;
    return { needsReview, reviewed, imported, chartOrders, manual };
  }, [entries]);
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
      showToast("Trade closed - review generated"); load();
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : "Failed to close"); }
    finally { setSaving(false); }
  };

  const handleGetLesson = async (entry: JournalEntry) => {
    setLessonLoading(entry.id);
    try {
      const updated = await triggerTradeLesson(entry.id);
      setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
      if (selectedEntry?.id === updated.id) setSelectedEntry(updated);
      completeReview(updated.symbol);
      showToast("Trade lesson generated");
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : "Trade lesson failed"); }
    finally { setLessonLoading(null); }
  };

  const handleImportZerodha = async () => {
    setImporting(true);
    try {
      const r = await importZerodhaTrades();
      showToast(r.message);
      setBrokerLastSyncedAt(r.last_synced_at ?? new Date().toISOString());
      refreshBrokerStatus();
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

  const handleAnalyse = async () => {
    setAiLoading(true); setAiError(""); setAiAnalysis(null);
    try {
      const r = await analyseJournal();
      setAiAnalysis(r.analysis); setAiTradesCount(r.trades_analysed);
    } catch (e: unknown) { setAiError(e instanceof Error ? e.message : "Analysis failed"); }
    finally { setAiLoading(false); }
  };

  return (
    <div style={{ minHeight: "100%", background: "transparent", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 88, left: "50%", transform: "translateX(-50%)", zIndex: 50, fontSize: 13, padding: "10px 16px", borderRadius: "var(--radius-md)", background: "var(--surface-float)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}>
          {toast}
        </div>
      )}

      {/* Status bar */}
      <JournalStatusBar
        brokerConnected={brokerConnected}
        brokerName={brokerName}
        brokerStatusLabel={brokerStatusLabel}
        canImport={brokerCanImport}
        lastSyncedAt={brokerLastSyncedAt}
        importing={importing}
        closedTrades={closedTrades}
        reviewedTrades={reviewedTrades}
        reviewReady={reviewReady}
        onImport={handleImportZerodha}
        onAddTrade={openAddPanel}
      />

      <div
        className="workspace-card"
        data-testid="journal-review-queue"
        style={{ padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}
      >
        <div style={{ minWidth: 240, flex: "1 1 320px" }}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-tertiary)" }}>
            Review queue
          </div>
          <div className="mt-1 text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
            {journalQueue.needsReview > 0
              ? `${journalQueue.needsReview} closed ${journalQueue.needsReview === 1 ? "trade needs" : "trades need"} review`
              : "No closed trades waiting for review"}
          </div>
          <div className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            Broker imports, chart orders, simulated orders, and manual logs stay labeled so reviews can explain what happened and why.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Needs review", value: journalQueue.needsReview, color: "var(--warn)" },
            { label: "Reviewed", value: journalQueue.reviewed, color: "var(--gain)" },
            { label: "Broker import", value: journalQueue.imported, color: "var(--accent)" },
            { label: "Chart/sim", value: journalQueue.chartOrders, color: "var(--text-secondary)" },
            { label: "Manual", value: Math.max(0, journalQueue.manual), color: "var(--text-tertiary)" },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              className="rounded-[8px] px-3 py-2"
              style={{ background: "rgba(244,247,251,0.05)", border: "1px solid var(--border-subtle)", minWidth: 92 }}
            >
              <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{label}</div>
              <div className="text-[16px] font-semibold" style={{ color }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        <StatCard label="Total P&L" value={stats ? fmtCcy(stats.total_pnl) : "—"} deltaVariant={stats ? (stats.total_pnl >= 0 ? "gain" : "loss") : "neutral"} />
        <StatCard label="Win rate" value={stats ? `${stats.win_rate}%` : "—"} deltaVariant={stats ? (stats.win_rate >= 50 ? "gain" : "loss") : "neutral"} />
        <StatCard label="Closed trades" value={String(stats?.total_trades ?? "—")} />
        <StatCard label="Open trades" value={String(stats?.open_trades ?? "—")} />
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {([{ id: "trades", label: "Trades" }, { id: "analytics", label: "Analytics" }, { id: "ai", label: "Trade review" }] as { id: Tab; label: string }[]).map(({ id, label }) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: "8px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer",
            color: tab === id ? "var(--text-primary)" : "var(--text-secondary)",
            background: tab === id ? "var(--surface-2)" : "transparent",
            border: `1px solid ${tab === id ? "var(--border-default)" : "transparent"}`,
            borderRadius: "var(--radius-md)",
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Analytics tab ── */}
      {tab === "analytics" && <JournalAnalyticsTab analytics={analytics} />}

      {/* ── Trade review tab ── */}
      {tab === "ai" && (
        <JournalAiInsights
          patterns={patterns}
          patternsLoading={patternsLoading}
          aiAnalysis={aiAnalysis}
          aiTradesCount={aiTradesCount}
          aiLoading={aiLoading}
          aiError={aiError}
          closedTrades={closedTrades}
          reviewedTrades={reviewedTrades}
          autoAnalysisStarted={autoAnalysisStarted}
          onAnalyse={handleAnalyse}
        />
      )}

      {/* ── Trades tab ── */}
      {tab === "trades" && (
        <div style={{ display: "flex", gap: 20 }}>
          <TradeTable
            entries={visibleEntries}
            loading={loading}
            filterStatus={filterStatus}
            onFilterChange={setFilterStatus}
            symbolFocus={symbolFocus}
            reviewFocus={reviewFocus}
            onClearFocus={() => {
              setSymbolFocus("");
              setReviewFocus("all");
            }}
            selectedEntry={selectedEntry}
            onSelectEntry={e => { setSelectedEntry(e); setPanelMode("view"); }}
            onCloseEntry={openClosePanel}
            onDeleteEntry={handleDelete}
            onAddTrade={openAddPanel}
            journalPlan={journalPlan}
          />
          <TradePanel
            mode={panelMode}
            selectedEntry={selectedEntry}
            saving={saving}
            lessonLoading={lessonLoading}
            addForm={addForm}
            onAddFormChange={setAddForm}
            symbolQ={symbolQ}
            onSymbolQChange={setSymbolQ}
            symbolResults={symbolResults}
            selectedSymbol={selectedSymbol}
            onSelectSymbol={s => { setSelectedSymbol(s); setSymbolResults([]); }}
            tradeValue={tradeValue}
            riskRupees={riskRupees}
            rrRatio={rrRatio}
            onAddTrade={handleAddTrade}
            closeForm={closeForm}
            onCloseFormChange={setCloseForm}
            closeSetupType={closeSetupType}
            onCloseSetupTypeChange={setCloseSetupType}
            pnlPreview={pnlPreview}
            onCloseTrade={handleCloseTrade}
            onClose={() => { setPanelMode(null); setSelectedEntry(null); }}
            onGetLesson={handleGetLesson}
            onInitiateClose={openClosePanel}
          />
        </div>
      )}
    </div>
  );
}
