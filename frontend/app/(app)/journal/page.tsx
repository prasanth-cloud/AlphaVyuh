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
import type {
  JournalEntry,
  JournalStats,
  JournalAnalytics,
  CreateJournalEntry,
  UpdateJournalEntry,
  SymbolSearchResult,
  AiPatterns,
} from "@/lib/api";
import { Badge } from "@/components/ui";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCcy(v: number | null | undefined) {
  if (v == null) return "—";
  const abs = Math.abs(v);
  const str =
    abs >= 100000
      ? `₹${(abs / 100000).toFixed(2)}L`
      : `₹${abs.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  return v >= 0 ? str : `-${str}`;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

// ── Setup type chips ──────────────────────────────────────────────────────────

const SETUP_TYPES = [
  "VCP",
  "Breakout",
  "Stage 2",
  "Base Build",
  "Cup & Handle",
  "Oversold Bounce",
  "Trend Follow",
  "Earnings Play",
  "Pullback",
  "Reversal",
  "Other",
];

function SetupChips({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {SETUP_TYPES.map((s) => {
        const active = value === s.toLowerCase();
        return (
          <button
            key={s}
            onClick={() => onChange(active ? "" : s.toLowerCase())}
            style={{
              padding: "2px 8px",
              fontSize: 11,
              fontWeight: 500,
              cursor: "pointer",
              border: `1px solid ${active ? "var(--accent)" : "var(--border-subtle)"}`,
              background: active ? "var(--accent-subtle)" : "transparent",
              color: active ? "var(--accent)" : "var(--text-secondary)",
              borderRadius: "var(--radius-sm)",
              transition: "all 100ms ease-out",
            }}
          >
            {s}
          </button>
        );
      })}
    </div>
  );
}

// ── Equity Curve SVG ──────────────────────────────────────────────────────────

function EquityCurve({
  data,
}: {
  data: { date: string; cumulative_pnl: number }[];
}) {
  if (data.length < 2)
    return (
      <div
        style={{
          height: 140,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          color: "var(--text-tertiary)",
        }}
      >
        Close at least 2 trades to see equity curve
      </div>
    );
  const W = 600,
    H = 120,
    PAD = 8;
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
  const color = last >= 0 ? "var(--gain)" : "var(--loss)";
  const fillPts = `${PAD},${zeroY} ${pts.join(" ")} ${W - PAD},${zeroY}`;
  const gradId = last >= 0 ? "eq-gain" : "eq-loss";
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: 120 }}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            style={{
              stopColor: last >= 0 ? "var(--gain)" : "var(--loss)",
              stopOpacity: 0.18,
            }}
          />
          <stop
            offset="100%"
            style={{
              stopColor: last >= 0 ? "var(--gain)" : "var(--loss)",
              stopOpacity: 0.02,
            }}
          />
        </linearGradient>
      </defs>
      <line
        x1={PAD}
        y1={zeroY}
        x2={W - PAD}
        y2={zeroY}
        stroke="var(--border-subtle)"
        strokeWidth="1"
      />
      <polygon points={fillPts} fill={`url(#${gradId})`} />
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DrawdownChart({
  data,
}: {
  data: { date: string; drawdown: number; drawdown_pct: number }[];
}) {
  if (data.length < 2) return null;
  const hasDD = data.some((d) => d.drawdown < 0);
  if (!hasDD)
    return (
      <div
        style={{
          height: 80,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          color: "var(--gain)",
        }}
      >
        No drawdown — all-time high throughout
      </div>
    );
  const W = 600,
    H = 80,
    PAD = 8;
  const vals = data.map((d) => d.drawdown);
  const min = Math.min(...vals, -0.01);
  const pts = data.map((d, i) => {
    const x = PAD + (i / (data.length - 1)) * (W - PAD * 2);
    const y = PAD + ((0 - d.drawdown) / (0 - min)) * (H - PAD * 2);
    return `${x},${y}`;
  });
  const fillPts = `${PAD},${H - PAD} ${pts.join(" ")} ${W - PAD},${H - PAD}`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: 80 }}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="dd-grad" x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            style={{ stopColor: "var(--loss)", stopOpacity: 0.25 }}
          />
          <stop
            offset="100%"
            style={{ stopColor: "var(--loss)", stopOpacity: 0.04 }}
          />
        </linearGradient>
      </defs>
      <polygon points={fillPts} fill="url(#dd-grad)" />
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="var(--loss)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Shared style constants ────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: "var(--radius-md)",
  height: 32,
  padding: "0 10px",
  fontSize: 13,
  background: "var(--surface-2)",
  border: "1px solid var(--border-default)",
  color: "var(--text-primary)",
  outline: "none",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  height: "auto",
  padding: "7px 10px",
  resize: "none",
};

const primaryBtn: React.CSSProperties = {
  height: 32,
  padding: "0 14px",
  fontSize: 12,
  fontWeight: 600,
  borderRadius: "var(--radius-md)",
  background: "var(--accent)",
  color: "var(--text-on-accent)",
  border: "none",
  cursor: "pointer",
};

const ghostBtn: React.CSSProperties = {
  height: 32,
  padding: "0 12px",
  fontSize: 12,
  fontWeight: 500,
  borderRadius: "var(--radius-md)",
  background: "transparent",
  color: "var(--text-secondary)",
  border: "1px solid var(--border-subtle)",
  cursor: "pointer",
};

const dangerBtn: React.CSSProperties = {
  height: 32,
  padding: "0 14px",
  fontSize: 12,
  fontWeight: 600,
  borderRadius: "var(--radius-md)",
  background: "var(--loss-subtle)",
  color: "var(--loss)",
  border: "1px solid rgba(225,85,96,0.25)",
  cursor: "pointer",
};

// ── Panel section label ───────────────────────────────────────────────────────

function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: "var(--text-tertiary)",
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

type PanelMode = "add" | "close" | "view" | null;
type Tab = "trades" | "analytics" | "ai";

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
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "closed">(
    "all"
  );
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

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = filterStatus === "all" ? {} : { status: filterStatus };
      const [e, s, a] = await Promise.all([
        getJournalEntries(params),
        getJournalStats(),
        getJournalAnalytics(),
      ]);
      setEntries(e.entries);
      setJournalPlan(e.plan ?? null);
      setStats(s);
      setAnalytics(a);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getBrokerStatus()
      .then((s) => {
        setBrokerConnected(s.connected);
        setBrokerName(s.broker);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (tab !== "ai" || patterns !== null) return;
    setPatternsLoading(true);
    getAiPatterns()
      .then(setPatterns)
      .catch(() => {})
      .finally(() => setPatternsLoading(false));
  }, [tab, patterns]);

  useEffect(() => {
    if (symbolQ.length < 1) {
      setSymbolResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const r = await searchSymbols(symbolQ);
      setSymbolResults(r.slice(0, 6));
    }, 250);
    return () => clearTimeout(t);
  }, [symbolQ]);

  const tradeValue =
    addForm.entry_price && addForm.quantity
      ? addForm.entry_price * addForm.quantity
      : null;
  const riskRupees =
    addForm.entry_price && addForm.stop_loss && addForm.quantity
      ? Math.abs(addForm.entry_price - addForm.stop_loss) * addForm.quantity
      : null;
  const rrRatio =
    addForm.entry_price && addForm.stop_loss && addForm.target_price
      ? (() => {
          const risk =
            addForm.trade_type === "long"
              ? addForm.entry_price - addForm.stop_loss
              : addForm.stop_loss - addForm.entry_price;
          const reward =
            addForm.trade_type === "long"
              ? addForm.target_price - addForm.entry_price
              : addForm.entry_price - addForm.target_price;
          return risk > 0 ? (reward / risk).toFixed(2) : null;
        })()
      : null;

  const pnlPreview =
    selectedEntry && closeForm.exit_price
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
    if (
      !selectedSymbol ||
      !addForm.entry_price ||
      !addForm.quantity ||
      !addForm.entry_date ||
      !addForm.trade_type
    ) {
      showToast("Fill in symbol, date, price and quantity");
      return;
    }
    setSaving(true);
    try {
      await createJournalEntry({
        ...addForm,
        symbol: selectedSymbol,
      } as CreateJournalEntry);
      setAddForm({
        trade_type: "long",
        entry_date: new Date().toISOString().split("T")[0],
      });
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
      await updateJournalEntry(selectedEntry.id, {
        ...closeForm,
        ...(closeSetupType ? { setup_type: closeSetupType } : {}),
      } as UpdateJournalEntry);
      setPanelMode(null);
      setSelectedEntry(null);
      showToast("Trade closed — AI analysing…");
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
      setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
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
    if (selectedEntry?.id === id) {
      setSelectedEntry(null);
      setPanelMode(null);
    }
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
    setAddForm({
      trade_type: "long",
      entry_date: new Date().toISOString().split("T")[0],
    });
    setSelectedSymbol("");
    setSymbolQ("");
    setPanelMode("add");
  };

  // ── Compact stats for status bar ────────────────────────────────────────────

  const statusContext = stats
    ? [
        {
          val: fmtCcy(stats.total_pnl),
          color:
            stats.total_pnl >= 0 ? "var(--gain)" : "var(--loss)",
        },
        { val: `${stats.win_rate}% win`, color: "var(--text-tertiary)" },
        {
          val: `${stats.total_trades} closed`,
          color: "var(--text-tertiary)",
        },
        ...(stats.open_trades > 0
          ? [
              {
                val: `${stats.open_trades} open`,
                color: "var(--warn)",
              },
            ]
          : []),
      ]
    : [];

  // ── Broker label ────────────────────────────────────────────────────────────

  const brokerLabel = brokerConnected && brokerName
    ? brokerName.charAt(0).toUpperCase() + brokerName.slice(1)
    : null;

  return (
    <div
      style={{
        minHeight: "100%",
        background: "transparent",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            top: 80,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 50,
            fontSize: 13,
            padding: "8px 14px",
            borderRadius: "var(--radius-md)",
            background: "var(--surface-float)",
            border: "1px solid var(--border-default)",
            color: "var(--text-primary)",
            boxShadow: "var(--shadow-dropdown)",
          }}
        >
          {toast}
        </div>
      )}

      {/* ── Status bar ── */}
      <div
        style={{
          height: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          background: "var(--surface-1)",
          borderBottom: "1px solid var(--border-subtle)",
          flexShrink: 0,
        }}
      >
        {/* Left: title + compact stats */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              fontSize: 15,
              fontWeight: 500,
              color: "var(--text-primary)",
            }}
          >
            Journal
          </span>
          {statusContext.length > 0 && (
            <span
              className="font-mono tabular-nums"
              style={{ fontSize: 12, color: "var(--text-tertiary)" }}
            >
              {statusContext.map((item, i) => (
                <span key={i}>
                  {i > 0 && (
                    <span style={{ color: "var(--border-default)", margin: "0 4px" }}>·</span>
                  )}
                  <span style={{ color: item.color }}>{item.val}</span>
                </span>
              ))}
            </span>
          )}
        </div>

        {/* Right: broker sync + actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            {brokerLabel ? `↑ ${brokerLabel}` : "Not connected"}
          </span>
          {brokerConnected && brokerName === "zerodha" && (
            <button
              onClick={handleImportZerodha}
              disabled={importing}
              style={{ ...ghostBtn, opacity: importing ? 0.5 : 1 }}
            >
              {importing ? "Importing…" : "Import"}
            </button>
          )}
          <button onClick={openAddPanel} style={primaryBtn}>
            + Log trade
          </button>
        </div>
      </div>

      {/* ── Toolbar: tabs + filter ── */}
      <div
        style={{
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          background: "var(--surface-1)",
          borderBottom: "1px solid var(--border-subtle)",
          flexShrink: 0,
        }}
      >
        {/* Tab switcher */}
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {(
            [
              { id: "trades", label: "Trades" },
              { id: "analytics", label: "Analytics" },
              { id: "ai", label: "AI analysis" },
            ] as { id: Tab; label: string }[]
          ).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                height: 24,
                padding: "0 10px",
                fontSize: 12,
                fontWeight: tab === id ? 600 : 400,
                cursor: "pointer",
                color:
                  tab === id ? "var(--accent)" : "var(--text-tertiary)",
                background:
                  tab === id ? "var(--accent-subtle)" : "transparent",
                border:
                  tab === id
                    ? "1px solid rgba(86,215,193,0.2)"
                    : "1px solid transparent",
                borderRadius: "var(--radius-sm)",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Status filter — trades tab only */}
        {tab === "trades" && (
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            {(["all", "open", "closed"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                style={{
                  height: 22,
                  padding: "0 8px",
                  fontSize: 11,
                  fontWeight: filterStatus === s ? 600 : 400,
                  cursor: "pointer",
                  textTransform: "capitalize",
                  background:
                    filterStatus === s ? "var(--accent)" : "transparent",
                  color:
                    filterStatus === s
                      ? "var(--text-on-accent)"
                      : "var(--text-tertiary)",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Free plan notice ── */}
      {journalPlan === "free" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "6px 16px",
            fontSize: 12,
            background: "var(--warn-subtle)",
            borderBottom: "1px solid rgba(232,163,59,0.2)",
            flexShrink: 0,
          }}
        >
          <span style={{ color: "var(--warn)" }}>
            Free plan shows last 3 months of trades only.
          </span>
          <a
            href="/settings/billing"
            style={{ fontWeight: 600, color: "var(--accent)" }}
          >
            Upgrade to Pro
          </a>
        </div>
      )}

      {/* ── Tab content ── */}
      <div style={{ flex: 1, padding: "12px 16px", minHeight: 0 }}>

        {/* ── Trades ── */}
        {tab === "trades" && (
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            {/* Table */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-lg)",
                  overflow: "hidden",
                }}
              >
                <table
                  style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}
                >
                  <thead>
                    <tr
                      style={{
                        borderBottom: "1px solid var(--border-subtle)",
                        background: "var(--surface-2)",
                      }}
                    >
                      {[
                        { label: "Symbol", align: "left" as const },
                        { label: "Type", align: "left" as const },
                        { label: "Entry", align: "left" as const },
                        { label: "Entry px", align: "right" as const },
                        { label: "Exit px", align: "right" as const },
                        { label: "P&L", align: "right" as const },
                        { label: "Status", align: "left" as const },
                        { label: "", align: "right" as const },
                      ].map(({ label, align }) => (
                        <th
                          key={label}
                          style={{
                            textAlign: align,
                            padding: "8px 12px",
                            fontSize: 11,
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            color: "var(--text-tertiary)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <tr
                          key={i}
                          style={{
                            borderBottom: "1px solid var(--border-subtle)",
                          }}
                        >
                          {Array.from({ length: 8 }).map((__, j) => (
                            <td key={j} style={{ padding: "8px 12px" }}>
                              <div
                                style={{
                                  height: 12,
                                  borderRadius: "var(--radius-sm)",
                                  background: "var(--surface-3)",
                                  width: j === 0 ? 70 : 50,
                                }}
                              />
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : entries.length === 0 ? (
                      <tr>
                        <td colSpan={8}>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: "40px 0",
                              gap: 8,
                            }}
                          >
                            <span style={{ fontSize: 18, color: "var(--text-disabled)" }}>↗</span>
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 500,
                                color: "var(--text-secondary)",
                              }}
                            >
                              No trades yet
                            </span>
                            <span
                              style={{
                                fontSize: 12,
                                color: "var(--text-tertiary)",
                              }}
                            >
                              Log your first trade to start building your journal.
                            </span>
                            <button
                              onClick={openAddPanel}
                              style={{ ...ghostBtn, marginTop: 6 }}
                            >
                              + Log trade
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      entries.map((e) => {
                        const isSelected = selectedEntry?.id === e.id;
                        return (
                          <tr
                            key={e.id}
                            onClick={() => {
                              setSelectedEntry(e);
                              setPanelMode("view");
                            }}
                            style={{
                              borderBottom: "1px solid var(--border-subtle)",
                              borderLeft: isSelected
                                ? "2px solid var(--accent)"
                                : "2px solid transparent",
                              background: isSelected
                                ? "var(--accent-subtle)"
                                : "transparent",
                              cursor: "pointer",
                              transition: "background 100ms ease-out",
                              height: 36,
                            }}
                            onMouseEnter={(ev) => {
                              if (!isSelected)
                                (
                                  ev.currentTarget as HTMLElement
                                ).style.background = "var(--surface-3)";
                            }}
                            onMouseLeave={(ev) => {
                              if (!isSelected)
                                (
                                  ev.currentTarget as HTMLElement
                                ).style.background = "transparent";
                            }}
                          >
                            <td style={{ padding: "0 12px" }}>
                              <span
                                className="font-mono"
                                style={{
                                  fontWeight: 600,
                                  color: "var(--text-primary)",
                                  fontSize: 13,
                                }}
                              >
                                {e.symbol}
                              </span>
                              {e.setup_type && (
                                <span
                                  style={{
                                    marginLeft: 6,
                                    fontSize: 11,
                                    color: "var(--text-tertiary)",
                                  }}
                                >
                                  {e.setup_type}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: "0 12px" }}>
                              <Badge
                                variant={
                                  e.trade_type === "long" ? "gain" : "loss"
                                }
                              >
                                {e.trade_type === "long" ? "L" : "S"}
                              </Badge>
                            </td>
                            <td
                              style={{
                                padding: "0 12px",
                                color: "var(--text-secondary)",
                                fontSize: 12,
                              }}
                            >
                              {fmtDate(e.entry_date)}
                            </td>
                            <td
                              style={{ padding: "0 12px", textAlign: "right" }}
                            >
                              <span
                                className="font-mono tabular-nums"
                                style={{
                                  fontWeight: 500,
                                  color: "var(--text-primary)",
                                  fontSize: 13,
                                }}
                              >
                                ₹{e.entry_price.toLocaleString("en-IN")}
                              </span>
                            </td>
                            <td
                              style={{ padding: "0 12px", textAlign: "right" }}
                            >
                              <span
                                className="font-mono tabular-nums"
                                style={{
                                  color: "var(--text-secondary)",
                                  fontSize: 13,
                                }}
                              >
                                {e.exit_price
                                  ? `₹${e.exit_price.toLocaleString("en-IN")}`
                                  : "—"}
                              </span>
                            </td>
                            <td
                              style={{ padding: "0 12px", textAlign: "right" }}
                            >
                              {e.pnl == null ? (
                                <span
                                  style={{
                                    fontSize: 12,
                                    color: "var(--text-tertiary)",
                                  }}
                                >
                                  Open
                                </span>
                              ) : (
                                <span
                                  className="font-mono tabular-nums"
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 600,
                                    padding: "2px 5px",
                                    borderRadius: "var(--radius-sm)",
                                    color:
                                      e.pnl >= 0
                                        ? "var(--gain)"
                                        : "var(--loss)",
                                    background:
                                      e.pnl >= 0
                                        ? "var(--gain-subtle)"
                                        : "var(--loss-subtle)",
                                  }}
                                >
                                  {e.pnl >= 0 ? "+" : ""}
                                  {fmtCcy(e.pnl)}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: "0 12px" }}>
                              {e.status === "open" ? (
                                <Badge variant="accent">Open</Badge>
                              ) : e.pnl != null ? (
                                <Badge variant={e.pnl >= 0 ? "gain" : "loss"}>
                                  {e.pnl >= 0 ? "Win" : "Loss"}
                                </Badge>
                              ) : (
                                <Badge variant="neutral">{e.status}</Badge>
                              )}
                            </td>
                            <td
                              style={{ padding: "0 12px", textAlign: "right" }}
                              onClick={(ev) => ev.stopPropagation()}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  justifyContent: "flex-end",
                                }}
                              >
                                {e.status === "open" && (
                                  <button
                                    onClick={() => openClosePanel(e)}
                                    style={{
                                      fontSize: 11,
                                      color: "var(--accent)",
                                      cursor: "pointer",
                                      background: "none",
                                      border: "none",
                                      padding: 0,
                                    }}
                                  >
                                    Close
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDelete(e.id)}
                                  aria-label="Delete trade"
                                  style={{
                                    fontSize: 14,
                                    lineHeight: 1,
                                    color: "var(--text-tertiary)",
                                    cursor: "pointer",
                                    background: "none",
                                    border: "none",
                                    padding: 0,
                                  }}
                                >
                                  ×
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Side panel */}
            {panelMode && (
              <div
                style={{
                  width: 312,
                  flexShrink: 0,
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-lg)",
                  padding: 12,
                }}
              >
                {/* Panel header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 12,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    {panelMode === "add"
                      ? "Log trade"
                      : panelMode === "close"
                        ? `Close ${selectedEntry?.symbol}`
                        : selectedEntry?.symbol}
                  </span>
                  <button
                    onClick={() => {
                      setPanelMode(null);
                      setSelectedEntry(null);
                    }}
                    aria-label="Close panel"
                    style={{
                      fontSize: 16,
                      lineHeight: 1,
                      color: "var(--text-tertiary)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    ×
                  </button>
                </div>

                {/* ── ADD FORM ── */}
                {panelMode === "add" && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    <div style={{ position: "relative" }}>
                      <PanelLabel>Symbol</PanelLabel>
                      <input
                        value={selectedSymbol || symbolQ}
                        onChange={(ev) => {
                          setSelectedSymbol("");
                          setSymbolQ(ev.target.value.toUpperCase());
                        }}
                        placeholder="e.g. RELIANCE"
                        style={inputStyle}
                      />
                      {symbolResults.length > 0 && !selectedSymbol && (
                        <div
                          style={{
                            position: "absolute",
                            top: "100%",
                            left: 0,
                            right: 0,
                            borderRadius: "var(--radius-xl)",
                            boxShadow: "var(--shadow-modal)",
                            zIndex: 20,
                            overflow: "hidden",
                            marginTop: 2,
                            background: "var(--surface-float)",
                            border: "1px solid var(--border-default)",
                          }}
                        >
                          {symbolResults.map((r) => (
                            <button
                              key={r.symbol}
                              onClick={() => {
                                setSelectedSymbol(r.symbol);
                                setSymbolQ(r.symbol);
                                setSymbolResults([]);
                              }}
                              style={{
                                width: "100%",
                                textAlign: "left",
                                padding: "7px 10px",
                                fontSize: 13,
                                borderBottom:
                                  "1px solid var(--border-subtle)",
                                color: "var(--text-primary)",
                                background: "none",
                                cursor: "pointer",
                              }}
                            >
                              <span style={{ fontWeight: 500 }}>
                                {r.symbol}
                              </span>
                              <span
                                style={{
                                  fontSize: 11,
                                  color: "var(--text-tertiary)",
                                  marginLeft: 8,
                                }}
                              >
                                {r.company_name}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <PanelLabel>Direction</PanelLabel>
                      <div style={{ display: "flex", gap: 6 }}>
                        {(["long", "short"] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() =>
                              setAddForm((f) => ({ ...f, trade_type: t }))
                            }
                            style={{
                              flex: 1,
                              height: 28,
                              borderRadius: "var(--radius-sm)",
                              fontSize: 12,
                              fontWeight: 500,
                              cursor: "pointer",
                              textTransform: "capitalize",
                              background:
                                addForm.trade_type === t
                                  ? t === "long"
                                    ? "var(--gain-subtle)"
                                    : "var(--loss-subtle)"
                                  : "var(--surface-2)",
                              color:
                                addForm.trade_type === t
                                  ? t === "long"
                                    ? "var(--gain)"
                                    : "var(--loss)"
                                  : "var(--text-secondary)",
                              border: `1px solid ${addForm.trade_type === t ? (t === "long" ? "var(--gain)" : "var(--loss)") : "var(--border-subtle)"}`,
                            }}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <PanelLabel>Entry date</PanelLabel>
                      <input
                        type="date"
                        value={addForm.entry_date || ""}
                        onChange={(ev) =>
                          setAddForm((f) => ({
                            ...f,
                            entry_date: ev.target.value,
                          }))
                        }
                        style={inputStyle}
                      />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div>
                        <PanelLabel>Entry price ₹</PanelLabel>
                        <input
                          type="number"
                          value={addForm.entry_price || ""}
                          onChange={(ev) =>
                            setAddForm((f) => ({
                              ...f,
                              entry_price: parseFloat(ev.target.value) || undefined,
                            }))
                          }
                          placeholder="0.00"
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <PanelLabel>Quantity</PanelLabel>
                        <input
                          type="number"
                          value={addForm.quantity || ""}
                          onChange={(ev) =>
                            setAddForm((f) => ({
                              ...f,
                              quantity: parseInt(ev.target.value) || undefined,
                            }))
                          }
                          placeholder="0"
                          style={inputStyle}
                        />
                      </div>
                    </div>

                    {tradeValue && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-tertiary)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        Trade value: ₹{tradeValue.toLocaleString("en-IN")}
                      </div>
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div>
                        <PanelLabel>Stop loss ₹</PanelLabel>
                        <input
                          type="number"
                          value={addForm.stop_loss || ""}
                          onChange={(ev) =>
                            setAddForm((f) => ({
                              ...f,
                              stop_loss: parseFloat(ev.target.value) || undefined,
                            }))
                          }
                          placeholder="optional"
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <PanelLabel>Target ₹</PanelLabel>
                        <input
                          type="number"
                          value={addForm.target_price || ""}
                          onChange={(ev) =>
                            setAddForm((f) => ({
                              ...f,
                              target_price:
                                parseFloat(ev.target.value) || undefined,
                            }))
                          }
                          placeholder="optional"
                          style={inputStyle}
                        />
                      </div>
                    </div>

                    {(riskRupees || rrRatio) && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-tertiary)",
                          display: "flex",
                          gap: 10,
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {riskRupees && (
                          <span>
                            Risk: ₹{riskRupees.toLocaleString("en-IN")}
                          </span>
                        )}
                        {rrRatio && (
                          <span
                            style={{
                              fontWeight: 600,
                              color:
                                parseFloat(rrRatio) >= 2
                                  ? "var(--gain)"
                                  : "var(--warn)",
                            }}
                          >
                            R:R 1:{rrRatio}
                          </span>
                        )}
                      </div>
                    )}

                    <div>
                      <PanelLabel>Setup</PanelLabel>
                      <SetupChips
                        value={addForm.setup_type || ""}
                        onChange={(v) =>
                          setAddForm((f) => ({
                            ...f,
                            setup_type: v || undefined,
                          }))
                        }
                      />
                    </div>

                    <div>
                      <PanelLabel>Why are you entering?</PanelLabel>
                      <textarea
                        value={addForm.entry_reason || ""}
                        onChange={(ev) =>
                          setAddForm((f) => ({
                            ...f,
                            entry_reason: ev.target.value,
                          }))
                        }
                        rows={3}
                        placeholder="EMA alignment, volume surge, breakout of resistance…"
                        style={textareaStyle}
                      />
                    </div>

                    <button
                      onClick={handleAddTrade}
                      disabled={saving}
                      style={{ ...primaryBtn, width: "100%", opacity: saving ? 0.5 : 1 }}
                    >
                      {saving ? "Saving…" : "Save trade"}
                    </button>
                  </div>
                )}

                {/* ── CLOSE FORM ── */}
                {panelMode === "close" && selectedEntry && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--text-secondary)",
                        paddingBottom: 10,
                        borderBottom: "1px solid var(--border-subtle)",
                      }}
                    >
                      {selectedEntry.trade_type === "long" ? "Long" : "Short"}{" "}
                      · {selectedEntry.quantity} qty · Entered ₹
                      {selectedEntry.entry_price.toLocaleString("en-IN")} on{" "}
                      {fmtDate(selectedEntry.entry_date)}
                    </div>

                    <div>
                      <PanelLabel>Exit date</PanelLabel>
                      <input
                        type="date"
                        value={closeForm.exit_date || ""}
                        onChange={(ev) =>
                          setCloseForm((f) => ({
                            ...f,
                            exit_date: ev.target.value,
                          }))
                        }
                        style={inputStyle}
                      />
                    </div>

                    <div>
                      <PanelLabel>Exit price ₹</PanelLabel>
                      <input
                        type="number"
                        value={closeForm.exit_price || ""}
                        onChange={(ev) =>
                          setCloseForm((f) => ({
                            ...f,
                            exit_price: parseFloat(ev.target.value) || undefined,
                          }))
                        }
                        placeholder="0.00"
                        style={inputStyle}
                      />
                    </div>

                    {pnlPreview != null && (
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          padding: "6px 10px",
                          borderRadius: "var(--radius-sm)",
                          color:
                            pnlPreview >= 0 ? "var(--gain)" : "var(--loss)",
                          background:
                            pnlPreview >= 0
                              ? "var(--gain-subtle)"
                              : "var(--loss-subtle)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        P&L:{" "}
                        {pnlPreview >= 0 ? "+" : ""}
                        {fmtCcy(pnlPreview)} (
                        {(
                          (pnlPreview /
                            (selectedEntry!.entry_price *
                              selectedEntry!.quantity)) *
                          100
                        ).toFixed(2)}
                        %)
                      </div>
                    )}

                    <div>
                      <PanelLabel>Setup</PanelLabel>
                      <SetupChips
                        value={closeSetupType}
                        onChange={setCloseSetupType}
                      />
                    </div>

                    <div>
                      <PanelLabel>Why did you exit?</PanelLabel>
                      <textarea
                        value={closeForm.exit_reason || ""}
                        onChange={(ev) =>
                          setCloseForm((f) => ({
                            ...f,
                            exit_reason: ev.target.value,
                          }))
                        }
                        rows={2}
                        placeholder="Target hit, stop loss, chart breakdown…"
                        style={textareaStyle}
                      />
                    </div>

                    <div>
                      <PanelLabel>What went wrong?</PanelLabel>
                      <textarea
                        value={closeForm.mistakes || ""}
                        onChange={(ev) =>
                          setCloseForm((f) => ({
                            ...f,
                            mistakes: ev.target.value,
                          }))
                        }
                        rows={2}
                        placeholder="Sized too large, ignored stop…"
                        style={textareaStyle}
                      />
                    </div>

                    <div>
                      <PanelLabel>What did I learn?</PanelLabel>
                      <textarea
                        value={closeForm.lessons || ""}
                        onChange={(ev) =>
                          setCloseForm((f) => ({
                            ...f,
                            lessons: ev.target.value,
                          }))
                        }
                        rows={2}
                        placeholder="Always wait for confirmation…"
                        style={textareaStyle}
                      />
                    </div>

                    <button
                      onClick={handleCloseTrade}
                      disabled={saving}
                      style={{
                        ...primaryBtn,
                        width: "100%",
                        opacity: saving ? 0.5 : 1,
                      }}
                    >
                      {saving ? "Saving…" : "Close trade"}
                    </button>
                  </div>
                )}

                {/* ── VIEW ── */}
                {panelMode === "view" && selectedEntry && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8,
                        fontSize: 12,
                      }}
                    >
                      {[
                        [
                          "Direction",
                          selectedEntry.trade_type === "long" ? "Long" : "Short",
                        ],
                        ["Setup", selectedEntry.setup_type || "—"],
                        ["Entry date", fmtDate(selectedEntry.entry_date)],
                        ["Exit date", fmtDate(selectedEntry.exit_date)],
                        [
                          "Entry price",
                          `₹${selectedEntry.entry_price.toLocaleString("en-IN")}`,
                        ],
                        [
                          "Exit price",
                          selectedEntry.exit_price
                            ? `₹${selectedEntry.exit_price.toLocaleString("en-IN")}`
                            : "—",
                        ],
                        [
                          "Quantity",
                          selectedEntry.quantity.toLocaleString("en-IN"),
                        ],
                        [
                          "Hold days",
                          String(selectedEntry.holding_days ?? "—"),
                        ],
                        [
                          "Stop loss",
                          selectedEntry.stop_loss
                            ? `₹${selectedEntry.stop_loss.toLocaleString("en-IN")}`
                            : "—",
                        ],
                        [
                          "Target",
                          selectedEntry.target_price
                            ? `₹${selectedEntry.target_price.toLocaleString("en-IN")}`
                            : "—",
                        ],
                        ["R:R", String(selectedEntry.risk_reward ?? "—")],
                        [
                          "P&L",
                          selectedEntry.pnl != null
                            ? fmtCcy(selectedEntry.pnl)
                            : "Open",
                        ],
                      ].map(([k, v]) => (
                        <div key={k}>
                          <div
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              color: "var(--text-tertiary)",
                              marginBottom: 2,
                            }}
                          >
                            {k}
                          </div>
                          <div
                            className="font-mono tabular-nums"
                            style={{
                              fontWeight: 500,
                              color: "var(--text-primary)",
                              fontSize: 12,
                            }}
                          >
                            {v}
                          </div>
                        </div>
                      ))}
                    </div>

                    {selectedEntry.entry_reason && (
                      <div>
                        <PanelLabel>Entry reason</PanelLabel>
                        <p
                          style={{
                            fontSize: 12,
                            lineHeight: 1.6,
                            color: "var(--text-secondary)",
                            margin: 0,
                          }}
                        >
                          {selectedEntry.entry_reason}
                        </p>
                      </div>
                    )}

                    {selectedEntry.exit_reason && (
                      <div>
                        <PanelLabel>Exit reason</PanelLabel>
                        <p
                          style={{
                            fontSize: 12,
                            lineHeight: 1.6,
                            color: "var(--text-secondary)",
                            margin: 0,
                          }}
                        >
                          {selectedEntry.exit_reason}
                        </p>
                      </div>
                    )}

                    {selectedEntry.mistakes && (
                      <div>
                        <PanelLabel>Mistakes</PanelLabel>
                        <p
                          style={{
                            fontSize: 12,
                            lineHeight: 1.6,
                            color: "var(--loss)",
                            margin: 0,
                          }}
                        >
                          {selectedEntry.mistakes}
                        </p>
                      </div>
                    )}

                    {selectedEntry.lessons ? (
                      <div
                        style={{
                          borderRadius: "var(--radius-md)",
                          padding: "10px 12px",
                          background: "var(--gain-subtle)",
                          border: "1px solid rgba(45,181,116,0.2)",
                        }}
                      >
                        <PanelLabel>AI lesson</PanelLabel>
                        {selectedEntry.lessons
                          .split("\n")
                          .map((line, i) => {
                            if (!line.trim()) return null;
                            const clean = line
                              .replace(/^[-•*]\s*/, "")
                              .replace(/\*\*(.*?)\*\*/g, "$1");
                            return (
                              <div
                                key={i}
                                style={{
                                  display: "flex",
                                  gap: 6,
                                  alignItems: "flex-start",
                                  fontSize: 12,
                                  lineHeight: 1.6,
                                  marginBottom: 4,
                                  color: "var(--text-secondary)",
                                }}
                              >
                                <span
                                  style={{
                                    color: "var(--gain)",
                                    flexShrink: 0,
                                    marginTop: 2,
                                  }}
                                >
                                  •
                                </span>
                                <span>{clean}</span>
                              </div>
                            );
                          })}
                      </div>
                    ) : (
                      selectedEntry.status === "closed" && (
                        <button
                          onClick={() => handleGetLesson(selectedEntry)}
                          disabled={lessonLoading === selectedEntry.id}
                          style={{
                            ...ghostBtn,
                            width: "100%",
                            color: "var(--accent)",
                            borderColor: "var(--accent)",
                            opacity:
                              lessonLoading === selectedEntry.id ? 0.5 : 1,
                          }}
                        >
                          {lessonLoading === selectedEntry.id
                            ? "Generating AI lesson…"
                            : "Get AI lesson"}
                        </button>
                      )
                    )}

                    {selectedEntry.status === "open" && (
                      <button
                        onClick={() => openClosePanel(selectedEntry)}
                        style={{ ...primaryBtn, width: "100%" }}
                      >
                        Close this trade
                      </button>
                    )}

                    <button
                      onClick={() => handleDelete(selectedEntry.id)}
                      style={{ ...dangerBtn, width: "100%" }}
                    >
                      Delete trade
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Analytics ── */}
        {tab === "analytics" && (
          <div
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-lg)",
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            {/* Equity curve */}
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  marginBottom: 2,
                }}
              >
                Equity curve
              </div>
              <div
                style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8 }}
              >
                Cumulative P&amp;L across closed trades
              </div>
              <EquityCurve data={analytics?.equity_curve ?? []} />
            </div>

            {/* Monthly P&L */}
            {(analytics?.monthly_pnl?.length ?? 0) > 0 && (
              <div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    marginBottom: 8,
                  }}
                >
                  Monthly P&amp;L
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {analytics!.monthly_pnl.map((m) => {
                    const pos = m.pnl >= 0;
                    return (
                      <div
                        key={m.month}
                        style={{
                          flex: "1 1 72px",
                          minWidth: 72,
                          borderRadius: "var(--radius-md)",
                          padding: "8px 10px",
                          textAlign: "center",
                          background: pos
                            ? "var(--gain-subtle)"
                            : "var(--loss-subtle)",
                        }}
                      >
                        <div
                          className="font-mono tabular-nums"
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: pos ? "var(--gain)" : "var(--loss)",
                          }}
                        >
                          {m.pnl >= 0 ? "+" : ""}₹
                          {Math.abs(m.pnl).toLocaleString("en-IN", {
                            maximumFractionDigits: 0,
                          })}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: "var(--text-tertiary)",
                            marginTop: 2,
                          }}
                        >
                          {m.month}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Setup breakdown */}
            {(analytics?.setup_breakdown?.length ?? 0) > 0 && (
              <div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    marginBottom: 8,
                  }}
                >
                  Performance by setup
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      fontSize: 12,
                      borderCollapse: "collapse",
                    }}
                  >
                    <thead>
                      <tr
                        style={{ borderBottom: "1px solid var(--border-subtle)" }}
                      >
                        {["Setup", "Trades", "Win rate", "Avg P&L", "Total P&L"].map(
                          (h) => (
                            <th
                              key={h}
                              style={{
                                textAlign: "left",
                                paddingBottom: 6,
                                paddingRight: 14,
                                fontSize: 11,
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                                color: "var(--text-tertiary)",
                              }}
                            >
                              {h}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {analytics!.setup_breakdown.map((s) => {
                        const pos = s.total_pnl >= 0;
                        return (
                          <tr
                            key={s.setup}
                            style={{
                              borderBottom: "1px solid var(--border-subtle)",
                            }}
                          >
                            <td
                              style={{
                                padding: "8px 14px 8px 0",
                                color: "var(--text-primary)",
                                fontWeight: 500,
                              }}
                            >
                              {s.setup}
                            </td>
                            <td
                              style={{
                                padding: "8px 14px 8px 0",
                                color: "var(--text-secondary)",
                                fontFamily: "var(--font-mono)",
                              }}
                            >
                              {s.trades}
                            </td>
                            <td style={{ padding: "8px 14px 8px 0" }}>
                              <span
                                className="font-mono tabular-nums"
                                style={{
                                  fontWeight: 600,
                                  color:
                                    s.win_rate >= 50
                                      ? "var(--gain)"
                                      : "var(--loss)",
                                }}
                              >
                                {s.win_rate}%
                              </span>
                            </td>
                            <td style={{ padding: "8px 14px 8px 0" }}>
                              <span
                                className="font-mono tabular-nums"
                                style={{
                                  color:
                                    s.avg_pnl >= 0
                                      ? "var(--gain)"
                                      : "var(--loss)",
                                }}
                              >
                                {s.avg_pnl >= 0 ? "+" : ""}₹
                                {Math.abs(s.avg_pnl).toLocaleString("en-IN", {
                                  maximumFractionDigits: 0,
                                })}
                              </span>
                            </td>
                            <td style={{ padding: "8px 0" }}>
                              <span
                                className="font-mono tabular-nums"
                                style={{
                                  fontWeight: 600,
                                  color: pos ? "var(--gain)" : "var(--loss)",
                                }}
                              >
                                {pos ? "+" : ""}₹
                                {Math.abs(s.total_pnl).toLocaleString("en-IN", {
                                  maximumFractionDigits: 0,
                                })}
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
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    marginBottom: 2,
                  }}
                >
                  Drawdown
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-tertiary)",
                    marginBottom: 8,
                  }}
                >
                  Underwater equity relative to all-time high
                </div>
                <DrawdownChart data={analytics!.drawdown_curve} />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: 8,
                    marginTop: 8,
                  }}
                >
                  {[
                    {
                      label: "Max drawdown",
                      val:
                        analytics!.max_drawdown != null
                          ? `₹${analytics!.max_drawdown.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
                          : "—",
                      neg: true,
                    },
                    {
                      label: "Longest DD",
                      val: analytics!.longest_dd_days
                        ? `${analytics!.longest_dd_days}d`
                        : "—",
                      neg: true,
                    },
                    {
                      label: "Recovery",
                      val:
                        analytics!.recovery_factor != null
                          ? analytics!.recovery_factor.toFixed(2)
                          : "—",
                      neg:
                        analytics!.recovery_factor != null &&
                        analytics!.recovery_factor < 1,
                    },
                    {
                      label: "Profit factor",
                      val:
                        analytics!.profit_factor != null
                          ? analytics!.profit_factor.toFixed(2)
                          : "—",
                      neg:
                        analytics!.profit_factor != null &&
                        analytics!.profit_factor < 1,
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      style={{
                        borderRadius: "var(--radius-md)",
                        padding: "8px 10px",
                        textAlign: "center",
                        background: "var(--surface-2)",
                      }}
                    >
                      <div
                        className="font-mono tabular-nums"
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: item.neg ? "var(--loss)" : "var(--gain)",
                        }}
                      >
                        {item.val}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: "var(--text-tertiary)",
                          marginTop: 3,
                        }}
                      >
                        {item.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!analytics?.setup_breakdown?.length &&
              !analytics?.equity_curve?.length && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    padding: "32px 0",
                    gap: 6,
                  }}
                >
                  <span
                    style={{ fontSize: 18, color: "var(--text-disabled)" }}
                  >
                    ↗
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--text-secondary)",
                    }}
                  >
                    No data yet
                  </span>
                  <span
                    style={{ fontSize: 12, color: "var(--text-tertiary)" }}
                  >
                    Close some trades to see analytics.
                  </span>
                </div>
              )}
          </div>
        )}

        {/* ── AI Analysis ── */}
        {tab === "ai" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Pattern stats */}
            <div
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-lg)",
                padding: 12,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  marginBottom: 2,
                }}
              >
                Pattern stats
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-tertiary)",
                  marginBottom: 12,
                }}
              >
                Computed from closed trades — no AI required.
              </div>

              {patternsLoading ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      style={{
                        height: 36,
                        borderRadius: "var(--radius-md)",
                        background: "var(--surface-3)",
                      }}
                    />
                  ))}
                </div>
              ) : !patterns?.ready ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    padding: "24px 0",
                    gap: 6,
                  }}
                >
                  <span
                    style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}
                  >
                    Not enough data yet
                  </span>
                  <span
                    style={{ fontSize: 12, color: "var(--text-tertiary)" }}
                  >
                    Close {patterns?.min_trades_required ?? 3} trades to unlock pattern stats.
                    {patterns?.trades_available != null &&
                      patterns.trades_available > 0 &&
                      ` You have ${patterns.trades_available} so far.`}
                  </span>
                </div>
              ) : (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 16 }}
                >
                  {/* Holding period */}
                  {(patterns.avg_hold_winners != null ||
                    patterns.avg_hold_losers != null) && (
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          color: "var(--text-tertiary)",
                          marginBottom: 6,
                        }}
                      >
                        Avg holding period
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {patterns.avg_hold_winners != null && (
                          <div
                            style={{
                              flex: 1,
                              borderRadius: "var(--radius-md)",
                              padding: "8px 10px",
                              textAlign: "center",
                              background: "var(--gain-subtle)",
                            }}
                          >
                            <div
                              className="font-mono"
                              style={{
                                fontSize: 15,
                                fontWeight: 600,
                                color: "var(--gain)",
                              }}
                            >
                              {patterns.avg_hold_winners}d
                            </div>
                            <div
                              style={{
                                fontSize: 10,
                                color: "var(--text-tertiary)",
                                marginTop: 2,
                              }}
                            >
                              Winners
                            </div>
                          </div>
                        )}
                        {patterns.avg_hold_losers != null && (
                          <div
                            style={{
                              flex: 1,
                              borderRadius: "var(--radius-md)",
                              padding: "8px 10px",
                              textAlign: "center",
                              background: "var(--loss-subtle)",
                            }}
                          >
                            <div
                              className="font-mono"
                              style={{
                                fontSize: 15,
                                fontWeight: 600,
                                color: "var(--loss)",
                              }}
                            >
                              {patterns.avg_hold_losers}d
                            </div>
                            <div
                              style={{
                                fontSize: 10,
                                color: "var(--text-tertiary)",
                                marginTop: 2,
                              }}
                            >
                              Losers
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Day of week */}
                  {(patterns.day_of_week?.length ?? 0) > 0 && (
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          color: "var(--text-tertiary)",
                          marginBottom: 6,
                        }}
                      >
                        Win rate by day
                      </div>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {patterns.day_of_week!.map((d) => (
                          <div
                            key={d.day}
                            style={{
                              flex: "1 1 52px",
                              minWidth: 52,
                              borderRadius: "var(--radius-md)",
                              padding: "6px 6px",
                              textAlign: "center",
                              border: "1px solid var(--border-subtle)",
                            }}
                          >
                            <div
                              className="font-mono"
                              style={{
                                fontSize: 12,
                                fontWeight: 600,
                                color:
                                  d.win_rate >= 60
                                    ? "var(--gain)"
                                    : d.win_rate >= 40
                                      ? "var(--warn)"
                                      : "var(--loss)",
                              }}
                            >
                              {d.win_rate}%
                            </div>
                            <div
                              style={{
                                fontSize: 10,
                                color: "var(--text-tertiary)",
                                marginTop: 1,
                              }}
                            >
                              {d.day.slice(0, 3)}
                            </div>
                            <div
                              style={{
                                fontSize: 9,
                                color: "var(--text-disabled)",
                              }}
                            >
                              {d.trades}t
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Holding period buckets */}
                  {(patterns.by_holding_period?.length ?? 0) > 0 && (
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          color: "var(--text-tertiary)",
                          marginBottom: 6,
                        }}
                      >
                        Win rate by holding period
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 5,
                        }}
                      >
                        {patterns.by_holding_period!.map((b) => (
                          <div
                            key={b.bucket}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            <span
                              style={{
                                flex: "0 0 100px",
                                fontSize: 11,
                                color: "var(--text-secondary)",
                              }}
                            >
                              {b.bucket}
                            </span>
                            <div
                              style={{
                                flex: 1,
                                height: 5,
                                background: "var(--surface-3)",
                                borderRadius: 3,
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  height: "100%",
                                  width: `${b.win_rate}%`,
                                  background:
                                    b.win_rate >= 60
                                      ? "var(--gain)"
                                      : b.win_rate >= 40
                                        ? "var(--warn)"
                                        : "var(--loss)",
                                  transition: "width 240ms ease-in-out",
                                }}
                              />
                            </div>
                            <span
                              className="font-mono"
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                flex: "0 0 32px",
                                textAlign: "right",
                                color:
                                  b.win_rate >= 60
                                    ? "var(--gain)"
                                    : b.win_rate >= 40
                                      ? "var(--warn)"
                                      : "var(--loss)",
                              }}
                            >
                              {b.win_rate}%
                            </span>
                            <span
                              style={{
                                fontSize: 10,
                                color: "var(--text-disabled)",
                                flex: "0 0 22px",
                              }}
                            >
                              {b.trades}t
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Long vs Short */}
                  {(patterns.by_direction?.length ?? 0) > 0 && (
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          color: "var(--text-tertiary)",
                          marginBottom: 6,
                        }}
                      >
                        Long vs short
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {patterns.by_direction!.map((d) => (
                          <div
                            key={d.direction}
                            style={{
                              flex: 1,
                              borderRadius: "var(--radius-md)",
                              padding: "8px 10px",
                              border: "1px solid var(--border-subtle)",
                            }}
                          >
                            <div
                              className="font-mono"
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color:
                                  d.win_rate >= 50
                                    ? "var(--gain)"
                                    : "var(--loss)",
                              }}
                            >
                              {d.win_rate}%
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                marginTop: 1,
                                color: "var(--text-secondary)",
                              }}
                            >
                              {d.direction} · {d.trades} trades
                            </div>
                            <div
                              className="font-mono"
                              style={{
                                fontSize: 11,
                                marginTop: 1,
                                color:
                                  d.total_pnl >= 0
                                    ? "var(--gain)"
                                    : "var(--loss)",
                              }}
                            >
                              {d.total_pnl >= 0 ? "+" : ""}₹
                              {Math.abs(d.total_pnl).toLocaleString("en-IN", {
                                maximumFractionDigits: 0,
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* AI deep analysis */}
            <div
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-lg)",
                padding: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  marginBottom: 12,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      marginBottom: 2,
                    }}
                  >
                    AI deep analysis
                  </div>
                  <div
                    style={{ fontSize: 12, color: "var(--text-tertiary)" }}
                  >
                    Claude reads your full journal and surfaces patterns and rules.
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
                      setAiError(
                        e instanceof Error ? e.message : "Analysis failed"
                      );
                    } finally {
                      setAiLoading(false);
                    }
                  }}
                  disabled={aiLoading}
                  style={{
                    ...primaryBtn,
                    flexShrink: 0,
                    marginLeft: 12,
                    opacity: aiLoading ? 0.5 : 1,
                  }}
                >
                  {aiLoading
                    ? "Analysing…"
                    : aiAnalysis
                      ? "Re-analyse"
                      : "Analyse my trades"}
                </button>
              </div>

              {aiError && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--loss)",
                    background: "var(--loss-subtle)",
                    border: "1px solid rgba(225,85,96,0.2)",
                    borderRadius: "var(--radius-md)",
                    padding: "8px 12px",
                    marginBottom: 10,
                  }}
                >
                  {aiError}
                </div>
              )}

              {aiLoading && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    padding: "32px 0",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      border: "2px solid var(--surface-3)",
                      borderTopColor: "var(--accent)",
                      animation: "spin 1s linear infinite",
                    }}
                  >
                    <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                  </div>
                  <div
                    style={{ fontSize: 12, color: "var(--text-tertiary)" }}
                  >
                    Reading journal and finding patterns…
                  </div>
                </div>
              )}

              {aiAnalysis && !aiLoading && (
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-tertiary)",
                      marginBottom: 10,
                    }}
                  >
                    Based on {aiTradesCount} closed trades
                  </div>
                  <div
                    style={{
                      marginBottom: 10,
                      padding: "8px 12px",
                      borderRadius: "var(--radius-md)",
                      fontSize: 11,
                      lineHeight: 1.6,
                      background: "var(--warn-subtle)",
                      border: "1px solid rgba(232,163,59,0.25)",
                      color: "var(--warn)",
                    }}
                  >
                    Educational only. Not SEBI-registered investment advice.
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      lineHeight: 1.7,
                      color: "var(--text-primary)",
                    }}
                  >
                    {aiAnalysis.split("\n").map((line, i) => {
                      if (line.startsWith("## ") || line.startsWith("### ")) {
                        return (
                          <div
                            key={i}
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              marginTop: 14,
                              marginBottom: 4,
                              color: "var(--text-primary)",
                            }}
                          >
                            {line.replace(/^#+\s/, "")}
                          </div>
                        );
                      }
                      if (
                        line.startsWith("**") &&
                        line.endsWith("**")
                      ) {
                        return (
                          <div
                            key={i}
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              marginTop: 10,
                              marginBottom: 4,
                            }}
                          >
                            {line.replace(/\*\*/g, "")}
                          </div>
                        );
                      }
                      if (line.startsWith("- ") || line.startsWith("* ")) {
                        return (
                          <div
                            key={i}
                            style={{
                              display: "flex",
                              gap: 8,
                              alignItems: "flex-start",
                              marginBottom: 4,
                            }}
                          >
                            <span
                              style={{
                                color: "var(--accent)",
                                flexShrink: 0,
                                marginTop: 2,
                              }}
                            >
                              •
                            </span>
                            <span
                              dangerouslySetInnerHTML={{
                                __html: line
                                  .slice(2)
                                  .replace(
                                    /\*\*(.*?)\*\*/g,
                                    "<strong>$1</strong>"
                                  ),
                              }}
                            />
                          </div>
                        );
                      }
                      if (line.trim() === "")
                        return <div key={i} style={{ height: 5 }} />;
                      return (
                        <div
                          key={i}
                          dangerouslySetInnerHTML={{
                            __html: line.replace(
                              /\*\*(.*?)\*\*/g,
                              "<strong>$1</strong>"
                            ),
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {!aiAnalysis && !aiLoading && !aiError && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    padding: "24px 0",
                    gap: 4,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--text-secondary)",
                    }}
                  >
                    No analysis yet
                  </span>
                  <span
                    style={{ fontSize: 12, color: "var(--text-tertiary)" }}
                  >
                    Requires at least 3 closed trades.
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
