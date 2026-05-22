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
import { EyebrowLabel, Num, StatCard } from "@/components/ui";
import { JournalStatusBar } from "./components/JournalStatusBar";
import { fmtCcy, getTradeFlowMeta } from "./components/utils";
import { TradeTable } from "./components/TradeTable";
import { TradePanel } from "./components/TradePanel";
import { JournalAnalytics as JournalAnalyticsTab } from "./components/JournalAnalytics";
import { JournalAiInsights } from "./components/JournalAiInsights";
import type { PanelMode, Tab } from "./components/types";
import { useWorkflowState } from "@/lib/workflow";
import { trackEvent } from "@/lib/analytics";
import { accountDataErrorMessage } from "@/lib/account-data-status";

const JOURNAL_RECOVERY_MESSAGE = "Check Journal or Data Status, then try again.";
const JOURNAL_TRADE_SAVE_FAILED_MESSAGE = `Trade could not be saved. ${JOURNAL_RECOVERY_MESSAGE}`;
const JOURNAL_TRADE_CLOSE_FAILED_MESSAGE = `Trade could not be closed. ${JOURNAL_RECOVERY_MESSAGE}`;
const JOURNAL_TRADE_DELETE_FAILED_MESSAGE = `Trade could not be deleted. ${JOURNAL_RECOVERY_MESSAGE}`;
const JOURNAL_LESSON_FAILED_MESSAGE = `Trade lesson could not be generated. ${JOURNAL_RECOVERY_MESSAGE}`;
const JOURNAL_REVIEW_SAVE_FAILED_MESSAGE = `Review could not be saved. ${JOURNAL_RECOVERY_MESSAGE}`;
const JOURNAL_IMPORT_FAILED_MESSAGE = `Broker import could not run. Check Broker or Data Status, then try again.`;
const JOURNAL_ANALYSIS_FAILED_MESSAGE = `Journal analysis could not run. ${JOURNAL_RECOVERY_MESSAGE}`;
const JOURNAL_SYMBOL_SEARCH_FAILED_MESSAGE = "Symbol search is temporarily unavailable. Check Data Status, then try again.";
const JOURNAL_IMPORT_RESULT_FAILED_MESSAGE = `Broker import result was unavailable. Check Broker or Data Status, then refresh Journal.`;

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
  const [patternsError, setPatternsError] = useState<string | null>(null);
  const [brokerConnected, setBrokerConnected] = useState(false);
  const [brokerName, setBrokerName] = useState<string | null>(null);
  const [brokerStatusLabel, setBrokerStatusLabel] = useState<string | null>(null);
  const [brokerStatusError, setBrokerStatusError] = useState<string | null>(null);
  const [brokerCanImport, setBrokerCanImport] = useState(false);
  const [brokerLastSyncedAt, setBrokerLastSyncedAt] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [lessonLoading, setLessonLoading] = useState<string | null>(null);
  const [stats, setStats] = useState<JournalStats | null>(null);
  const [analytics, setAnalytics] = useState<JournalAnalytics | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [journalLoadError, setJournalLoadError] = useState<string | null>(null);
  const [journalStatsError, setJournalStatsError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "closed">("all");
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [saving, setSaving] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [toast, setToast] = useState("");

  const [symbolQ, setSymbolQ] = useState("");
  const [symbolResults, setSymbolResults] = useState<SymbolSearchResult[]>([]);
  const [symbolSearchError, setSymbolSearchError] = useState("");
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
    const params = filterStatus === "all" ? {} : { status: filterStatus };
    const [entriesResult, statsResult] = await Promise.allSettled([
      getJournalEntries(params),
      getJournalStats(),
    ]);

    if (entriesResult.status === "fulfilled") {
      setEntries(entriesResult.value.entries);
      setJournalPlan(entriesResult.value.plan ?? null);
      setJournalLoadError(null);
      getJournalAnalytics()
        .then((analytics) => {
          setAnalytics(analytics);
          setAnalyticsError(null);
        })
        .catch((error) => {
          setAnalytics(null);
          setAnalyticsError(accountDataErrorMessage(error, "Journal analytics are temporarily unavailable. Trade rows may still be current."));
        });
    } else {
      setJournalLoadError(accountDataErrorMessage(entriesResult.reason, "Journal entries are temporarily unavailable. Your trades were not loaded."));
      setAnalytics(null);
      setAnalyticsError(null);
    }

    if (statsResult.status === "fulfilled") {
      setStats(statsResult.value);
      setJournalStatsError(null);
    } else {
      setStats(null);
      setJournalStatsError(accountDataErrorMessage(statsResult.reason, "Journal stats are temporarily unavailable. Trade rows may still be current."));
    }

    setLoading(false);
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
      setBrokerStatusError(null);
    }).catch((error) => {
      setBrokerConnected(false);
      setBrokerName(null);
      setBrokerStatusLabel(null);
      setBrokerCanImport(false);
      setBrokerStatusError(accountDataErrorMessage(error, "Broker import status is temporarily unavailable. Reconnect or retry before importing."));
    });
  }, []);

  useEffect(() => { refreshBrokerStatus(); }, [refreshBrokerStatus]);

  useEffect(() => {
    if (tab !== "ai" || patterns !== null) return;
    setPatternsLoading(true);
    getAiPatterns()
      .then((patterns) => {
        setPatterns(patterns);
        setPatternsError(null);
      })
      .catch((error) => {
        setPatterns(null);
        setPatternsError(accountDataErrorMessage(error, "Trade pattern review is temporarily unavailable."));
      })
      .finally(() => setPatternsLoading(false));
  }, [tab, patterns]);

  useEffect(() => {
    if (symbolQ.length < 1) { setSymbolResults([]); setSymbolSearchError(""); return; }
    const t = setTimeout(async () => {
      try {
        const r = await searchSymbols(symbolQ);
        setSymbolResults(r.slice(0, 6));
        setSymbolSearchError("");
      } catch {
        setSymbolResults([]);
        setSymbolSearchError(JOURNAL_SYMBOL_SEARCH_FAILED_MESSAGE);
      }
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

  const closedTradesFromRows = entries.filter(entry => entry.status === "closed").length;
  const closedTrades = stats?.total_trades ?? (journalLoadError ? 0 : closedTradesFromRows);
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
      trackEvent("journal_entry_created", { source: "manual", symbol: selectedSymbol, trade_type: addForm.trade_type ?? "unknown" });
      setAddForm({ trade_type: "long", entry_date: new Date().toISOString().split("T")[0] });
      setSelectedSymbol(""); setSymbolQ(""); setPanelMode(null);
      showToast("Trade logged"); load();
    } catch { showToast(JOURNAL_TRADE_SAVE_FAILED_MESSAGE); }
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
    } catch { showToast(JOURNAL_TRADE_CLOSE_FAILED_MESSAGE); }
    finally { setSaving(false); }
  };

  const handleGetLesson = async (entry: JournalEntry) => {
    setLessonLoading(entry.id);
    try {
      const updated = await triggerTradeLesson(entry.id);
      setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
      if (selectedEntry?.id === updated.id) setSelectedEntry(updated);
      completeReview(updated.symbol);
      trackEvent("journal_entry_reviewed", { source: getTradeFlowMeta(updated).sourceLabel, symbol: updated.symbol });
      showToast("Trade lesson generated");
    } catch { showToast(JOURNAL_LESSON_FAILED_MESSAGE); }
    finally { setLessonLoading(null); }
  };

  const handleSaveReviewLesson = async (entry: JournalEntry, lesson: string) => {
    const cleaned = lesson.trim();
    if (!cleaned) {
      showToast("Add one lesson before saving the review");
      return;
    }
    setReviewSaving(true);
    try {
      const updated = await updateJournalEntry(entry.id, { lessons: cleaned });
      setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
      setSelectedEntry(updated);
      completeReview(updated.symbol);
      trackEvent("journal_entry_reviewed", { source: getTradeFlowMeta(updated).sourceLabel, symbol: updated.symbol, method: "manual" });
      showToast("Review saved");
    } catch { showToast(JOURNAL_REVIEW_SAVE_FAILED_MESSAGE); }
    finally { setReviewSaving(false); }
  };

  const handleImportZerodha = async () => {
    setImporting(true);
    try {
      const r = await importZerodhaTrades();
      trackEvent("journal_entry_created", { source: "broker_import", imported: r.imported, skipped: r.skipped });
      showToast(r.message || JOURNAL_IMPORT_RESULT_FAILED_MESSAGE);
      setBrokerLastSyncedAt(r.last_synced_at ?? new Date().toISOString());
      refreshBrokerStatus();
      if (r.imported > 0) load();
    } catch { showToast(JOURNAL_IMPORT_FAILED_MESSAGE); }
    finally { setImporting(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this trade?")) return;
    try {
      await deleteJournalEntry(id);
      if (selectedEntry?.id === id) { setSelectedEntry(null); setPanelMode(null); }
      showToast("Deleted"); load();
    } catch {
      showToast(JOURNAL_TRADE_DELETE_FAILED_MESSAGE);
    }
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
    } catch { setAiError(JOURNAL_ANALYSIS_FAILED_MESSAGE); }
    finally { setAiLoading(false); }
  };

  return (
    <div style={{ minHeight: "100%", background: "transparent", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Toast */}
      {toast && (
        <div data-testid="journal-toast" style={{ position: "fixed", top: 88, left: "50%", transform: "translateX(-50%)", zIndex: 50, fontSize: 13, padding: "10px 16px", borderRadius: "var(--radius-md)", background: "var(--surface-float)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}>
          {toast}
        </div>
      )}

      {/* Status bar */}
      <JournalStatusBar
        brokerConnected={brokerConnected}
        brokerName={brokerName}
        brokerStatusLabel={brokerStatusLabel}
        brokerUnavailableMessage={brokerStatusError}
        canImport={brokerCanImport}
        lastSyncedAt={brokerLastSyncedAt}
        importing={importing}
        closedTrades={closedTrades}
        reviewedTrades={reviewedTrades}
        reviewReady={reviewReady}
        onImport={handleImportZerodha}
        onAddTrade={openAddPanel}
      />

      {(journalLoadError || journalStatsError || brokerStatusError) && (
        <div
          className="workspace-card"
          data-testid="journal-account-data-status"
          style={{ padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", borderColor: "rgba(217,119,6,0.28)", background: "rgba(217,119,6,0.08)" }}
        >
          <div style={{ minWidth: 240, flex: "1 1 520px" }}>
            <EyebrowLabel>Account data status</EyebrowLabel>
            <div className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--warn)" }}>
              {journalLoadError ?? journalStatsError ?? brokerStatusError}
            </div>
            <div className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
              Existing journal entries, stats, and broker import state are not being treated as empty while services are unavailable.
            </div>
          </div>
          <button
            type="button"
            onClick={() => { void load(); refreshBrokerStatus(); }}
            className="workspace-chip-button"
          >
            Retry
          </button>
        </div>
      )}

      <div
        className="workspace-card"
        data-testid="journal-review-queue"
        style={{ padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}
      >
        <div style={{ minWidth: 240, flex: "1 1 320px" }}>
          <EyebrowLabel>Review and improvement</EyebrowLabel>
          <div className="mt-1 text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
            {journalLoadError
              ? "Journal entries are temporarily unavailable"
              : journalQueue.needsReview > 0
              ? <><Num>{journalQueue.needsReview}</Num> closed {journalQueue.needsReview === 1 ? "trade needs" : "trades need"} review</>
              : "No closed trades waiting for review"}
          </div>
          <div className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            Broker imports, chart drafts, journal captures, and manual logs stay labeled so reviews can explain what happened and why.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setTab("trades");
              setFilterStatus("closed");
              setReviewFocus("needs-review");
            }}
            className="rounded-[8px] px-3 py-2 text-left"
            style={{
              background: journalQueue.needsReview > 0 ? "rgba(217,119,6,0.12)" : "rgba(244,247,251,0.04)",
              border: "1px solid var(--border-subtle)",
              color: journalQueue.needsReview > 0 ? "var(--warn)" : "var(--text-secondary)",
              cursor: "pointer",
              minWidth: 112,
            }}
          >
            <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>Next action</div>
            <div className="text-[12px] font-semibold">{journalQueue.needsReview > 0 ? "Review now" : "Log next trade"}</div>
          </button>
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
              <Num className="text-[16px] font-semibold" style={{ color }}>{value}</Num>
            </div>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        <StatCard label="Total P&L" value={stats ? fmtCcy(stats.total_pnl) : journalStatsError ? "Unavailable" : "—"} deltaVariant={stats ? (stats.total_pnl >= 0 ? "gain" : "loss") : "neutral"} />
        <StatCard label="Win rate" value={stats ? `${stats.win_rate}%` : journalStatsError ? "Unavailable" : "—"} deltaVariant={stats ? (stats.win_rate >= 50 ? "gain" : "loss") : "neutral"} />
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
      {tab === "analytics" && <JournalAnalyticsTab analytics={analytics} analyticsError={analyticsError} />}

      {/* ── Trade review tab ── */}
      {tab === "ai" && (
        <JournalAiInsights
          patterns={patterns}
          patternsLoading={patternsLoading}
          patternsError={patternsError}
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
            unavailableMessage={journalLoadError}
            onRetry={load}
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
            symbolSearchError={symbolSearchError}
            selectedSymbol={selectedSymbol}
            onSelectSymbol={s => { setSelectedSymbol(s); setSymbolResults([]); setSymbolSearchError(""); }}
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
            onSaveReviewLesson={handleSaveReviewLesson}
            onInitiateClose={openClosePanel}
            reviewSaving={reviewSaving}
          />
        </div>
      )}
    </div>
  );
}
