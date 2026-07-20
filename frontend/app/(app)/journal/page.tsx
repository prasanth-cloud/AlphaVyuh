"use client";

import { useEffect, useState, useCallback, useMemo, type KeyboardEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  getJournalEntries, getJournalStats, getJournalAnalytics,
  createJournalEntry, updateJournalEntry, deleteJournalEntry,
  searchSymbols, analyseJournal, getAiPatterns,
  triggerTradeLesson, importZerodhaTrades, getBrokerStatus,
  getJournalWeeklyReviews, getJournalWeeklyReviewEvidence, saveJournalProcessReview,
} from "@/lib/api";
import type { JournalEntry, JournalStats, JournalAnalytics, JournalWeeklyReviewResponse, JournalRuleBreakCode, CreateJournalEntry, UpdateJournalEntry, SymbolSearchResult, AiPatterns, SaveJournalProcessReviewRequest } from "@/lib/api";
import { EyebrowLabel, Num, StatCard } from "@/components/ui";
import { JournalStatusBar } from "./components/JournalStatusBar";
import { fmtCcy, getDecisionMemorySummary, getJournalReviewStage, getTradeFlowMeta } from "./components/utils";
import { normalizeSetupTagForSave } from "@/lib/setup-tag-display";
import { TradeTable } from "./components/TradeTable";
import { TradePanel } from "./components/TradePanel";
import { JournalAnalytics as JournalAnalyticsTab } from "./components/JournalAnalytics";
import { JournalAiInsights } from "./components/JournalAiInsights";
import { JournalWeeklyReview } from "./components/JournalWeeklyReview";
import type { PanelMode, Tab } from "./components/types";
import { useWorkflowState } from "@/lib/workflow";
import { trackEvent } from "@/lib/analytics";
import { accountDataErrorMessage } from "@/lib/account-data-status";
import { BrokerFailureBanner } from "@/components/BrokerFailureBanner";
import { isCompletedProcessReview } from "@/lib/journal-weekly-review";

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
const JOURNAL_WEEKLY_REVIEW_FAILED_MESSAGE = `Weekly review is temporarily unavailable. ${JOURNAL_RECOVERY_MESSAGE}`;
const JOURNAL_TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: "queue", label: "Review queue" },
  { id: "weekly", label: "Weekly review" },
  { id: "ai", label: "Trade review" },
  { id: "analytics", label: "Analytics" },
  { id: "trades", label: "Trades" },
];

export default function JournalPage() {
  const searchParams = useSearchParams();
  const { completeReview } = useWorkflowState();
  const [tab, setTab] = useState<Tab>("queue");
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
  const [weeklyReview, setWeeklyReview] = useState<JournalWeeklyReviewResponse | null>(null);
  const [weeklyReviewLoading, setWeeklyReviewLoading] = useState(false);
  const [weeklyReviewError, setWeeklyReviewError] = useState<string | null>(null);
  const [weeklyEvidenceLoading, setWeeklyEvidenceLoading] = useState(false);
  const [entryIdFocus, setEntryIdFocus] = useState<string[]>([]);
  const [entryFocusLabel, setEntryFocusLabel] = useState("");
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
  const [dateFocus, setDateFocus] = useState("");
  const [processNoteExpanded, setProcessNoteExpanded] = useState(false);
  const [reviewFocus, setReviewFocus] = useState<"all" | "needs-review" | "reviewed">("all");

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % JOURNAL_TABS.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + JOURNAL_TABS.length) % JOURNAL_TABS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = JOURNAL_TABS.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = JOURNAL_TABS[nextIndex];
    setTab(nextTab.id);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`#journal-tab-${nextTab.id}`)
      ?.focus();
  };

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    const [entriesResult, statsResult] = await Promise.allSettled([
      getJournalEntries({ limit: 500 }),
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
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (requestedTab === "queue" || requestedTab === "review") {
      setTab("queue");
    } else if (requestedTab === "weekly" || requestedTab === "analytics" || requestedTab === "ai" || requestedTab === "trades") {
      setTab(requestedTab);
    } else {
      setTab("queue");
    }
    const requestedSymbol = searchParams.get("symbol");
    setSymbolFocus(requestedSymbol?.toUpperCase() ?? "");
    const requestedStatus = searchParams.get("status");
    if (requestedStatus === "open" || requestedStatus === "closed") {
      setFilterStatus(requestedStatus);
    } else {
      setFilterStatus("all");
    }
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

  const loadWeeklyReview = useCallback(async () => {
    setWeeklyReviewLoading(true);
    try {
      const result = await getJournalWeeklyReviews(8);
      setWeeklyReview(result);
      setWeeklyReviewError(null);
    } catch {
      setWeeklyReview(null);
      setWeeklyReviewError(JOURNAL_WEEKLY_REVIEW_FAILED_MESSAGE);
    } finally {
      setWeeklyReviewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "weekly" && !weeklyReview && !weeklyReviewLoading && !weeklyReviewError) void loadWeeklyReview();
  }, [loadWeeklyReview, tab, weeklyReview, weeklyReviewError, weeklyReviewLoading]);

  const invalidateWeeklyReview = useCallback(() => {
    setWeeklyReview(null);
    setWeeklyReviewError(null);
  }, []);

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
  const totalTrades = stats?.total_trades ?? (journalLoadError ? 0 : entries.length);
  const closedTrades = journalLoadError ? 0 : closedTradesFromRows;
  const reviewedTrades = entries.filter(entry => entry.status === "closed" && isCompletedProcessReview(entry)).length;
  const reviewReady = closedTrades >= 3;
  const visibleEntries = useMemo(() => (
    entries.filter((entry) => {
      if (symbolFocus && entry.symbol !== symbolFocus) return false;
      if (dateFocus && entry.exit_date?.slice(0, 10) !== dateFocus) return false;
      if (entryIdFocus.length && !entryIdFocus.includes(entry.id)) return false;
      if (filterStatus !== "all" && entry.status !== filterStatus) return false;
      if (reviewFocus === "needs-review") {
        return entry.status === "closed" && !isCompletedProcessReview(entry);
      }
      if (reviewFocus === "reviewed") {
        return entry.status === "closed" && isCompletedProcessReview(entry);
      }
      return true;
    })
  ), [dateFocus, entries, entryIdFocus, filterStatus, reviewFocus, symbolFocus]);
  const journalQueue = useMemo(() => {
    const closed = entries.filter((entry) => entry.status === "closed");
    const needsReview = closed.filter((entry) => !isCompletedProcessReview(entry)).length;
    const reviewed = closed.length - needsReview;
    const imported = entries.filter((entry) => getTradeFlowMeta(entry).sourceLabel === "Broker import").length;
    const chartOrders = entries.filter((entry) => getTradeFlowMeta(entry).sourceLabel === "Chart order").length;
    const manual = entries.length - imported - chartOrders;
    const open = entries.filter((entry) => entry.status === "open").length;
    return { needsReview, reviewed, imported, chartOrders, manual, open };
  }, [entries]);
  const reviewStage = useMemo(() => (
    getJournalReviewStage(entries, {
      totalTrades,
      closedTrades,
      reviewedTrades,
      needsReview: journalQueue.needsReview,
      unavailable: Boolean(journalLoadError),
    })
  ), [closedTrades, entries, journalLoadError, journalQueue.needsReview, reviewedTrades, totalTrades]);
  const decisionMemory = useMemo(() => (
    getDecisionMemorySummary(entries, {
      closedTrades,
      reviewedTrades,
      unavailable: Boolean(journalLoadError),
    })
  ), [closedTrades, entries, journalLoadError, reviewedTrades]);
  const handleAddTrade = async () => {
    if (!selectedSymbol || !addForm.entry_price || !addForm.quantity || !addForm.entry_date || !addForm.trade_type) {
      showToast("Fill in symbol, date, price and quantity"); return;
    }
    setSaving(true);
    try {
      await createJournalEntry({
        ...addForm,
        symbol: selectedSymbol,
        setup_type: normalizeSetupTagForSave(addForm.setup_type) ?? undefined,
      } as CreateJournalEntry);
      invalidateWeeklyReview();
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
      await updateJournalEntry(selectedEntry.id, {
        ...closeForm,
        ...(closeSetupType ? { setup_type: normalizeSetupTagForSave(closeSetupType) ?? undefined } : {}),
      } as UpdateJournalEntry);
      invalidateWeeklyReview();
      setPanelMode(null); setSelectedEntry(null);
      showToast("Trade closed - review generated"); load();
    } catch { showToast(JOURNAL_TRADE_CLOSE_FAILED_MESSAGE); }
    finally { setSaving(false); }
  };

  const handleGetLesson = async (entry: JournalEntry) => {
    setLessonLoading(entry.id);
    try {
      const updated = await triggerTradeLesson(entry.id);
      invalidateWeeklyReview();
      setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
      if (selectedEntry?.id === updated.id) setSelectedEntry(updated);
      showToast("Lesson draft generated. Confirm adherence before completing review.");
    } catch { showToast(JOURNAL_LESSON_FAILED_MESSAGE); }
    finally { setLessonLoading(null); }
  };

  const handleSaveProcessReview = async (
    entry: JournalEntry,
    review: Omit<SaveJournalProcessReviewRequest, "schema_version" | "expected_updated_at">,
  ) => {
    setReviewSaving(true);
    try {
      const updated = await saveJournalProcessReview(entry.id, {
        schema_version: 1,
        ...review,
        expected_updated_at: entry.updated_at,
      });
      setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
      setSelectedEntry(updated);
      completeReview(updated.symbol);
      trackEvent("journal_process_review_completed", { method: "manual" });
      invalidateWeeklyReview();
      showToast("Process review saved");
    } catch (error) {
      showToast(error instanceof Error && /changed in another view|refresh before saving/i.test(error.message)
        ? "Trade changed in another view. Refresh Journal before saving review."
        : JOURNAL_REVIEW_SAVE_FAILED_MESSAGE);
    }
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
      if (r.imported > 0) { invalidateWeeklyReview(); load(); }
    } catch { showToast(JOURNAL_IMPORT_FAILED_MESSAGE); }
    finally { setImporting(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this trade?")) return;
    try {
      await deleteJournalEntry(id);
      invalidateWeeklyReview();
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

  const handleCalendarDateSelect = (date: string) => {
    setDateFocus(date);
    setTab("trades");
    setFilterStatus("closed");
    setReviewFocus("all");
    setSymbolFocus("");
    setEntryIdFocus([]);
    setEntryFocusLabel("");
  };

  const handleWeeklyDrillThrough = async (request: { weekStart: string; entryIds: string[]; label: string; ruleBreak?: JournalRuleBreakCode }) => {
    const validated = Array.from(new Set(request.entryIds.filter((id) => /^[A-Za-z0-9-]{1,128}$/.test(id))));
    if (validated.length !== request.entryIds.length || validated.length < 1 || validated.length > 500) {
      showToast("Weekly review evidence request is invalid.");
      return;
    }
    setWeeklyEvidenceLoading(true);
    try {
      const evidence = await getJournalWeeklyReviewEvidence({ weekStart: request.weekStart, entryIds: validated, ruleBreak: request.ruleBreak });
      const evidenceIds = new Set(evidence.entries.map((entry) => entry.id));
      setEntries((current) => [...evidence.entries, ...current.filter((entry) => !evidenceIds.has(entry.id))]);
      setEntryIdFocus(evidence.entries.map((entry) => entry.id));
      setEntryFocusLabel(request.label);
      setSymbolFocus("");
      setDateFocus("");
      setReviewFocus("all");
      setFilterStatus("closed");
      setTab("trades");
    } catch {
      showToast("Weekly review evidence is unavailable. No local trade rows were substituted.");
    } finally {
      setWeeklyEvidenceLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100%", background: "transparent", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Toast */}
      {toast && (
        <div data-testid="journal-toast" style={{ position: "fixed", top: 88, left: "50%", transform: "translateX(-50%)", zIndex: 50, fontSize: 13, padding: "10px 16px", borderRadius: "var(--radius-md)", background: "var(--surface-float)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}>
          {toast}
        </div>
      )}

      <BrokerFailureBanner />

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
        className="workspace-hero journal-review-cockpit"
        data-testid="journal-review-queue"
        style={{ padding: 20, display: "grid", gap: 16, alignItems: "stretch" }}
      >
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 18 }}>
          <div>
            <EyebrowLabel>Review queue</EyebrowLabel>
            <div className="app-page-title" style={{ marginTop: 8 }}>
              {reviewStage.headline}
            </div>
            <div className="mt-2 max-w-2xl text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {reviewStage.detail}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
            {[
              { label: "Closed coverage", value: reviewStage.progressLabel, detail: `${reviewStage.progressPct}%`, tone: reviewStage.progressPct >= 70 ? "var(--gain)" : reviewStage.progressPct > 0 ? "var(--warn)" : "var(--text-secondary)" },
              { label: "Needs review", value: String(journalQueue.needsReview), detail: journalQueue.needsReview === 1 ? "trade" : "trades", tone: journalQueue.needsReview > 0 ? "var(--warn)" : "var(--gain)" },
              { label: "Open plans", value: String(journalQueue.open), detail: journalQueue.open === 1 ? "position" : "positions", tone: journalQueue.open > 0 ? "var(--accent)" : "var(--text-secondary)" },
            ].map((item) => (
              <div key={item.label} style={{ borderRadius: "var(--radius-md)", padding: "11px 12px", background: "rgba(244,247,251,0.04)", border: "1px solid var(--border-subtle)", minWidth: 0 }}>
                <div className="text-[11px] label" style={{ color: "var(--text-tertiary)" }}>{item.label}</div>
                <div className="mt-1 text-[16px] truncate" style={{ color: item.tone, fontWeight: 600 }}>{item.value}</div>
                <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{item.detail}</div>
              </div>
            ))}
          </div>

          <div data-testid="journal-review-coverage">
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
              <div>
                <div className="text-[11px] label" style={{ color: "var(--text-tertiary)", marginBottom: 4 }}>Review coverage</div>
                <Num
                  className="text-[28px] leading-none"
                  style={{
                    fontWeight: 600,
                    color: reviewStage.progressPct >= 70 ? "var(--gain)" : reviewStage.progressPct > 0 ? "var(--warn)" : "var(--text-secondary)",
                  }}
                >
                  {reviewStage.progressPct}%
                </Num>
              </div>
              <div className="text-[12px] text-right" style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}>
                <div>{reviewStage.progressLabel}</div>
                <div style={{ color: "var(--text-tertiary)" }}>
                  {reviewStage.status === "build-sample" ? "Sample unlock" : "Closed trades reviewed"}
                </div>
              </div>
            </div>
            <div style={{ height: 10, borderRadius: 999, overflow: "hidden", background: "var(--surface-3)", boxShadow: "inset 0 0 0 1px var(--border-subtle)" }}>
              <div
                style={{
                  width: `${reviewStage.progressPct}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: reviewStage.status === "ready"
                    ? "linear-gradient(90deg, var(--gain), #6ee7a8)"
                    : reviewStage.status === "needs-review"
                      ? "linear-gradient(90deg, var(--warn), #fbbf24)"
                      : "linear-gradient(90deg, var(--accent), #8ef3e2)",
                  transition: "width 400ms var(--ease-out)",
                }}
              />
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setTab("analytics")}
              className="workspace-chip-button"
            >
              Open Analytics
            </button>
            <Link href="/upload" className="workspace-chip-button" data-testid="journal-upload-link" style={{ textDecoration: "none" }}>
              Upload report
            </Link>
            <Link href="/data" className="workspace-chip-button" data-testid="journal-data-status-link" style={{ textDecoration: "none" }}>
              Data Status
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-3" style={{ minWidth: 0 }}>
          <div
            className="rounded-[8px] p-3"
            data-testid="journal-decision-memory"
            style={{ background: "rgba(244,247,251,0.04)", border: "1px solid var(--border-subtle)" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] label uppercase" style={{ color: "var(--text-tertiary)", letterSpacing: 0 }}>
                  Decision memory
                </div>
                <div className="mt-1 text-[13px]" style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                  {decisionMemory.headline}
                </div>
              </div>
              <div className="text-right">
                <Num className="text-[18px]" style={{ color: decisionMemory.status === "ready" ? "var(--gain)" : "var(--accent)", fontWeight: 600 }}>
                  {decisionMemory.coveragePct}%
                </Num>
                <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>reviewed</div>
              </div>
            </div>
            <div className="mt-2 text-[12px] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
              {decisionMemory.nextAction}
            </div>
            <div className="mt-2 text-[12px]" style={{ color: "var(--text-secondary)" }}>
              <Num>{decisionMemory.decisionContextCount}</Num> of your <Num>{decisionMemory.closedTrades}</Num> trades have full context attached (source, chart, or broker link).
            </div>
          </div>
          <div
            className="rounded-[8px] p-3"
            data-testid="journal-process-change"
            style={{ background: "rgba(244,247,251,0.04)", border: "1px solid var(--border-subtle)" }}
          >
            <div className="text-[11px] label" style={{ color: "var(--text-tertiary)" }}>What changed in my process</div>
            <div
              className={`mt-1 text-[12px] leading-relaxed journal-process-note${processNoteExpanded ? " journal-process-note-expanded" : ""}`}
              style={{ color: "var(--text-primary)" }}
            >
              {reviewStage.processChange}
            </div>
            {reviewStage.processChange.length > 120 && (
              <button
                type="button"
                className="journal-process-note-toggle"
                onClick={() => setProcessNoteExpanded((expanded) => !expanded)}
                aria-expanded={processNoteExpanded}
              >
                {processNoteExpanded ? "Show less" : "Read more →"}
              </button>
            )}
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
                <Num className="text-[16px]" style={{ color, fontWeight: 600 }}>{value}</Num>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        <StatCard label="Total P&L" value={stats ? fmtCcy(stats.total_pnl) : journalStatsError ? "Unavailable" : "—"} deltaVariant={stats ? (stats.total_pnl >= 0 ? "gain" : "loss") : "neutral"} />
        <StatCard label="Win rate" value={stats ? `${stats.win_rate}%` : journalStatsError ? "Unavailable" : "—"} deltaVariant={stats ? (stats.win_rate >= 50 ? "gain" : "loss") : "neutral"} />
        <StatCard label="Closed trades" value={journalLoadError ? "—" : String(closedTrades)} />
        <StatCard label="Open trades" value={journalLoadError ? "—" : String(stats?.open_trades ?? journalQueue.open)} />
      </div>

      {/* Tab bar */}
      <div role="tablist" aria-label="Journal views" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {JOURNAL_TABS.map(({ id, label }, index) => (
          <button
            key={id}
            id={`journal-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`journal-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
            style={{
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

      {JOURNAL_TABS.filter(({ id }) => id !== tab).map(({ id }) => (
        <div
          key={id}
          id={`journal-panel-${id}`}
          role="tabpanel"
          aria-labelledby={`journal-tab-${id}`}
          hidden
        />
      ))}

      {/* ── Analytics tab ── */}
      {tab === "analytics" && (
        <div id="journal-panel-analytics" role="tabpanel" aria-labelledby="journal-tab-analytics" tabIndex={0}>
          <JournalAnalyticsTab
            analytics={analytics}
            analyticsError={analyticsError}
            entries={entries}
            onCalendarDateSelect={handleCalendarDateSelect}
          />
        </div>
      )}

      {tab === "weekly" && (
        <div id="journal-panel-weekly" role="tabpanel" aria-labelledby="journal-tab-weekly" tabIndex={0}>
          <JournalWeeklyReview
            data={weeklyReview}
            loading={weeklyReviewLoading || (!weeklyReview && !weeklyReviewError)}
            error={weeklyReviewError}
            evidenceLoading={weeklyEvidenceLoading}
            onRetry={() => { setWeeklyReviewError(null); void loadWeeklyReview(); }}
            onDrillThrough={handleWeeklyDrillThrough}
          />
        </div>
      )}

      {/* ── Trade review tab ── */}
      {tab === "ai" && (
        <div id="journal-panel-ai" role="tabpanel" aria-labelledby="journal-tab-ai" tabIndex={0}>
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
        </div>
      )}

      {/* ── Review queue / Trades tab ── */}
      {(tab === "queue" || tab === "trades") && (
        <div
          id={`journal-panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`journal-tab-${tab}`}
          tabIndex={0}
          className="journal-trades-layout"
        >
          <TradeTable
            entries={visibleEntries}
            loading={loading}
            filterStatus={filterStatus}
            onFilterChange={setFilterStatus}
            symbolFocus={symbolFocus}
            dateFocus={dateFocus}
            reviewFocus={reviewFocus}
            entryFocusLabel={entryFocusLabel}
            onClearFocus={() => {
              setSymbolFocus("");
              setDateFocus("");
              setReviewFocus("all");
              setEntryIdFocus([]);
              setEntryFocusLabel("");
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
            onSaveProcessReview={handleSaveProcessReview}
            onInitiateClose={openClosePanel}
            reviewSaving={reviewSaving}
            riskPerShare={addForm.entry_price && addForm.stop_loss ? Math.abs(addForm.entry_price - addForm.stop_loss) : null}
            rMultiple={null}
            addFormPnl={null}
          />
        </div>
      )}
    </div>
  );
}
