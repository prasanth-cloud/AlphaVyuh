"use client";

import { useEffect, useState } from "react";

import { Card } from "@/components/ui";
import { formatSetupTagDisplay } from "@/lib/setup-tag-display";
import type {
  JournalAnalytics as JournalAnalyticsType,
  JournalAnalyticsCohortRow,
  JournalIntradayPathInterval,
  JournalAnalyticsRange,
  JournalEntry,
} from "./types";
import { JournalCalendarHeatmap } from "./JournalCalendarHeatmap";

function formatCurrency(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}₹${Math.abs(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function formatRatio(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(2);
}

function formatPct(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function toneForSigned(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "var(--text-secondary)";
  return value >= 0 ? "var(--gain)" : "var(--loss)";
}

const adherenceLabels = {
  followed: "Plan followed",
  partial: "Partially followed",
  not_followed: "Plan not followed",
  unknown: "Not reviewed",
} as const;

function getLastEquityValue(analytics: JournalAnalyticsType | null) {
  const curve = analytics?.equity_curve ?? [];
  return curve.length > 0 ? curve[curve.length - 1].cumulative_pnl : null;
}

function buildReviewSummary(analytics: JournalAnalyticsType | null) {
  const setupRows = analytics?.setup_breakdown ?? [];
  const monthlyRows = analytics?.monthly_pnl ?? [];
  const totalTrades = setupRows.reduce((sum, row) => sum + row.trades, 0);
  const totalPnl = getLastEquityValue(analytics) ?? monthlyRows.reduce((sum, row) => sum + row.pnl, 0);
  const expectancy = totalTrades > 0 ? totalPnl / totalTrades : null;
  const positiveMonths = monthlyRows.filter((row) => row.pnl > 0).length;
  const consistencyPct = monthlyRows.length > 0 ? (positiveMonths / monthlyRows.length) * 100 : null;
  const bestSetup = setupRows.length > 0
    ? [...setupRows].sort((a, b) => b.total_pnl - a.total_pnl)[0]
    : null;
  const weakestSetup = setupRows.length > 0
    ? [...setupRows].sort((a, b) => a.total_pnl - b.total_pnl)[0]
    : null;
  const largestMonth = monthlyRows.length > 0
    ? [...monthlyRows].sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))[0]
    : null;
  const drawdownAbs = analytics?.max_drawdown != null ? Math.abs(analytics.max_drawdown) : null;
  const drawdownToProfit = totalPnl > 0 && drawdownAbs && drawdownAbs > 0 ? drawdownAbs / totalPnl : null;

  const reviewFocus = (() => {
    if (analytics?.profit_factor != null && analytics.profit_factor < 1.4) return "Improve loss control before adding size.";
    if (drawdownToProfit != null && drawdownToProfit > 0.25) return "Review drawdown clusters and reduce repeat losses.";
    if (expectancy != null && expectancy <= 0) return "Positive win rate is not enough; raise average R or cut losers faster.";
    if (weakestSetup && weakestSetup.total_pnl < 0) return `Pause or tighten ${weakestSetup.setup} until it has cleaner evidence.`;
    if (bestSetup) return `Lean into ${bestSetup.setup}, then document why it is working.`;
    return "Close and review more trades to calibrate the edge.";
  })();

  return {
    bestSetup,
    consistencyPct,
    drawdownToProfit,
    expectancy,
    largestMonth,
    reviewFocus,
    totalPnl,
    totalTrades,
    weakestSetup,
  };
}

// ── SVG charts ────────────────────────────────────────────────────────────────

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
          <stop offset="0%" style={{ stopColor: last >= 0 ? 'var(--gain)' : 'var(--loss)', stopOpacity: 0.18 }} />
          <stop offset="100%" style={{ stopColor: last >= 0 ? 'var(--gain)' : 'var(--loss)', stopOpacity: 0.02 }} />
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
          <stop offset="0%" style={{ stopColor: 'var(--loss)', stopOpacity: 0.25 }} />
          <stop offset="100%" style={{ stopColor: 'var(--loss)', stopOpacity: 0.04 }} />
        </linearGradient>
      </defs>
      <polygon points={fillPts} fill="url(#dd-grad)" />
      <polyline points={pts.join(" ")} fill="none" stroke="var(--loss)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function CohortTable({
  id,
  title,
  caption,
  rows,
}: {
  id: string;
  title: string;
  caption: string;
  rows: JournalAnalyticsCohortRow[];
}) {
  return (
    <section data-testid={`journal-cohort-${id}`} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <h3 className="heading-card" style={{ marginBottom: 4 }}>{title}</h3>
        <div className="caption">{caption}</div>
      </div>
      {rows.length === 0 ? (
        <div className="caption">No closed trades in this cohort.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                {["Cohort", "Trades", "Win rate", "Avg R", "Avg P&L", "Total P&L"].map((heading) => (
                  <th key={heading} className="label" style={{ textAlign: "left", paddingBottom: 8, paddingRight: 16 }}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.cohort} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td style={{ padding: "9px 16px 9px 0", color: "var(--text-primary)", fontWeight: 500 }}>{row.cohort}</td>
                  <td style={{ padding: "9px 16px 9px 0", color: "var(--text-secondary)" }}>{row.trades}</td>
                  <td style={{ padding: "9px 16px 9px 0" }}><span className="mono" style={{ color: row.win_rate >= 50 ? "var(--gain)" : "var(--loss)" }}>{formatPct(row.win_rate)}</span></td>
                  <td style={{ padding: "9px 16px 9px 0" }}><span className="mono" style={{ color: toneForSigned(row.avg_r_multiple) }}>{formatRatio(row.avg_r_multiple)}</span></td>
                  <td style={{ padding: "9px 16px 9px 0" }}><span className="mono" style={{ color: toneForSigned(row.avg_pnl) }}>{formatCurrency(row.avg_pnl)}</span></td>
                  <td style={{ padding: "9px 0" }}><span className="mono" style={{ color: toneForSigned(row.total_pnl), fontWeight: 600 }}>{formatCurrency(row.total_pnl)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

type MaeMfeRow = NonNullable<JournalAnalyticsType["mae_mfe"]>["trades"][number];

function excursionBasisLabel(row: MaeMfeRow) {
  if (row.basis === "intraday_path") {
    return row.interval ? `${row.interval.replace("minute", "m")} path` : "Intraday path";
  }
  if (row.basis === "mixed_intraday_and_eod_proxy") return "Mixed";
  return "EOD proxy";
}

function MaeMfeTable({
  rows,
  onCaptureIntradayPath,
  captureLoadingId,
}: {
  rows: MaeMfeRow[];
  onCaptureIntradayPath?: (entryId: string, interval: JournalIntradayPathInterval) => Promise<void>;
  captureLoadingId?: string | null;
}) {
  if (rows.length === 0) return null;

  return (
    <div style={{ overflowX: "auto" }} data-testid="journal-mae-mfe-trades">
      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            {["Symbol", "MAE", "MFE", "MAE in R", "MFE in R", "Basis", "Bars", "Action"].map((heading) => (
              <th key={heading} className="label" style={{ textAlign: "left", paddingBottom: 8, paddingRight: 16 }}>{heading}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.journal_entry_id ?? row.symbol}-${index}`} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <td style={{ padding: "9px 16px 9px 0", color: "var(--text-primary)", fontWeight: 600 }}>{row.symbol}</td>
              <td style={{ padding: "9px 16px 9px 0" }}><span className="mono" style={{ color: "var(--loss)" }}>{formatPct(row.mae_pct)}</span></td>
              <td style={{ padding: "9px 16px 9px 0" }}><span className="mono" style={{ color: "var(--gain)" }}>{formatPct(row.mfe_pct)}</span></td>
              <td style={{ padding: "9px 16px 9px 0" }}><span className="mono" style={{ color: "var(--loss)" }}>{row.mae_r == null ? "—" : `${formatRatio(row.mae_r)}R`}</span></td>
              <td style={{ padding: "9px 16px 9px 0" }}><span className="mono" style={{ color: "var(--gain)" }}>{row.mfe_r == null ? "—" : `${formatRatio(row.mfe_r)}R`}</span></td>
              <td style={{ padding: "9px 16px 9px 0", color: "var(--text-secondary)" }}>{excursionBasisLabel(row)}</td>
              <td style={{ padding: "9px 16px 9px 0", color: "var(--text-secondary)" }}>{row.bars_count}</td>
              <td style={{ padding: "9px 0" }}>
                {onCaptureIntradayPath && row.journal_entry_id && row.basis !== "intraday_path" ? (
                  <button
                    type="button"
                    data-testid={`capture-intraday-path-${row.journal_entry_id}`}
                    disabled={captureLoadingId === row.journal_entry_id}
                    onClick={() => void onCaptureIntradayPath(row.journal_entry_id as string, "15minute")}
                    style={{
                      border: "1px solid var(--border-default)",
                      borderRadius: "var(--radius-sm)",
                      background: "transparent",
                      color: "var(--text-secondary)",
                      cursor: captureLoadingId === row.journal_entry_id ? "wait" : "pointer",
                      fontSize: 11,
                      padding: "5px 8px",
                    }}
                  >
                    {captureLoadingId === row.journal_entry_id ? "Capturing…" : "Capture 15m path"}
                  </button>
                ) : (
                  <span style={{ color: "var(--text-tertiary)" }}>—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface JournalAnalyticsProps {
  analytics: JournalAnalyticsType | null;
  analyticsError?: string | null;
  analyticsLoading?: boolean;
  analyticsRange?: JournalAnalyticsRange;
  onAnalyticsRangeChange?: (range: JournalAnalyticsRange) => void;
  entries?: JournalEntry[];
  onCalendarDateSelect?: (date: string) => void;
  onCaptureIntradayPath?: (entryId: string, interval: JournalIntradayPathInterval) => Promise<void>;
}

export function JournalAnalytics({
  analytics,
  analyticsError,
  analyticsLoading = false,
  analyticsRange = { fromDate: "", toDate: "" },
  onAnalyticsRangeChange,
  entries = [],
  onCalendarDateSelect,
  onCaptureIntradayPath,
}: JournalAnalyticsProps) {
  const [rangeDraft, setRangeDraft] = useState(analyticsRange);
  const [captureLoadingId, setCaptureLoadingId] = useState<string | null>(null);
  const { fromDate: analyticsFromDate, toDate: analyticsToDate } = analyticsRange;

  useEffect(() => {
    setRangeDraft({ fromDate: analyticsFromDate, toDate: analyticsToDate });
  }, [analyticsFromDate, analyticsToDate]);

  const invalidRange = Boolean(rangeDraft.fromDate && rangeDraft.toDate && rangeDraft.fromDate > rangeDraft.toDate);

  const handleCaptureIntradayPath = async (entryId: string, interval: JournalIntradayPathInterval) => {
    if (!onCaptureIntradayPath) return;
    setCaptureLoadingId(entryId);
    try {
      await onCaptureIntradayPath(entryId, interval);
    } finally {
      setCaptureLoadingId(null);
    }
  };

  if (analyticsError) {
    return (
      <Card padding="lg" data-testid="journal-analytics-unavailable">
        <div className="label" style={{ color: "var(--warn)", marginBottom: 8 }}>Analytics unavailable</div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)" }}>
          {analyticsError} Closed trades are not being counted as empty.
        </div>
      </Card>
    );
  }

  const summary = buildReviewSummary(analytics);
  const reviewSummary = analytics?.review_summary;
  const hasAnalytics = Boolean(
    analytics?.setup_breakdown?.length ||
    analytics?.equity_curve?.length ||
    analytics?.monthly_pnl?.length ||
    analytics?.drawdown_curve?.length ||
    reviewSummary ||
    analytics?.r_multiple_summary ||
    analytics?.cohort_breakdown,
  );
  const scoreCards = [
    {
      label: "Closed-trade P&L",
      value: formatCurrency(summary.totalPnl),
      detail: summary.totalTrades > 0 ? `${summary.totalTrades} setup-tagged trades` : "Waiting for closed trade history",
      color: toneForSigned(summary.totalPnl),
    },
    {
      label: "Expectancy / trade",
      value: formatCurrency(summary.expectancy),
      detail: "Average realised edge after closed trades",
      color: toneForSigned(summary.expectancy),
    },
    {
      label: "Profit factor",
      value: formatRatio(analytics?.profit_factor),
      detail: analytics?.profit_factor != null && analytics.profit_factor >= 2 ? "Strong realised payoff profile" : "Needs more proof before scaling",
      color: analytics?.profit_factor != null && analytics.profit_factor >= 1.5 ? "var(--gain)" : "var(--warn)",
    },
    {
      label: "Consistency",
      value: formatPct(summary.consistencyPct),
      detail: summary.consistencyPct != null ? "Positive months in current sample" : "Monthly sample unavailable",
      color: summary.consistencyPct != null && summary.consistencyPct >= 60 ? "var(--gain)" : "var(--warn)",
    },
  ];

  return (
    <div>
      <Card padding="lg">
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <section data-testid="journal-analytics-range" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, flexWrap: "wrap", paddingBottom: 4, borderBottom: "1px solid var(--border-subtle)" }}>
            <div>
              <div className="label" style={{ marginBottom: 5, color: "var(--text-tertiary)" }}>Analysis window</div>
              <div className="caption">Filter closed-trade outcomes by exit date. All metrics remain descriptive.</div>
              {invalidRange && <div className="caption" style={{ color: "var(--loss)", marginTop: 5 }}>From date must be on or before the to date.</div>}
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap" }}>
              <label className="caption" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                From
                <input
                  aria-label="Analytics from date"
                  type="date"
                  value={rangeDraft.fromDate}
                  onChange={(event) => setRangeDraft((current) => ({ ...current, fromDate: event.target.value }))}
                  style={{ minHeight: 34, padding: "6px 8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-default)", background: "var(--surface-1)", color: "var(--text-primary)" }}
                />
              </label>
              <label className="caption" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                To
                <input
                  aria-label="Analytics to date"
                  type="date"
                  value={rangeDraft.toDate}
                  onChange={(event) => setRangeDraft((current) => ({ ...current, toDate: event.target.value }))}
                  style={{ minHeight: 34, padding: "6px 8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-default)", background: "var(--surface-1)", color: "var(--text-primary)" }}
                />
              </label>
              <button
                type="button"
                disabled={invalidRange || analyticsLoading || !onAnalyticsRangeChange}
                onClick={() => onAnalyticsRangeChange?.(rangeDraft)}
                style={{ minHeight: 34, padding: "6px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-default)", background: "var(--surface-2)", color: "var(--text-primary)", cursor: invalidRange || analyticsLoading ? "not-allowed" : "pointer", opacity: invalidRange || analyticsLoading ? 0.6 : 1 }}
              >
                {analyticsLoading ? "Loading…" : "Apply"}
              </button>
              <button
                type="button"
                disabled={analyticsLoading || (!rangeDraft.fromDate && !rangeDraft.toDate)}
                onClick={() => {
                  const cleared = { fromDate: "", toDate: "" };
                  setRangeDraft(cleared);
                  onAnalyticsRangeChange?.(cleared);
                }}
                style={{ minHeight: 34, padding: "6px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", background: "transparent", color: "var(--text-secondary)", cursor: analyticsLoading ? "not-allowed" : "pointer" }}
              >
                Clear
              </button>
            </div>
          </section>

          {hasAnalytics && (
            <section data-testid="journal-edge-dashboard" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                <div>
                  <h2 className="heading-card" style={{ marginBottom: 4 }}>Edge dashboard</h2>
                  <div className="caption">Fast read on realised edge, risk drag, and the next review priority.</div>
                </div>
                <div style={{ maxWidth: 420, padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
                  <div className="label" style={{ marginBottom: 4, color: "var(--text-tertiary)" }}>Next review focus</div>
                  <div style={{ fontSize: 12, lineHeight: 1.55, color: "var(--text-primary)" }}>{summary.reviewFocus}</div>
                </div>
              </div>

              <div className="journal-edge-grid">
                {scoreCards.map((card) => (
                  <div key={card.label} style={{ borderRadius: "var(--radius-md)", padding: "12px 14px", background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
                    <div className="label" style={{ color: "var(--text-tertiary)", marginBottom: 6 }}>{card.label}</div>
                    <div className="mono" style={{ fontSize: 18, fontWeight: 600, color: card.color }}>{card.value}</div>
                    <div className="caption" style={{ marginTop: 5 }}>{card.detail}</div>
                  </div>
                ))}
              </div>

              <div className="journal-review-grid">
                <div style={{ borderRadius: "var(--radius-md)", padding: "12px 14px", background: "rgba(45,181,116,0.08)", border: "1px solid rgba(45,181,116,0.18)" }}>
                  <div className="label" style={{ color: "var(--gain)", marginBottom: 6 }}>Best setup</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{summary.bestSetup ? formatSetupTagDisplay(summary.bestSetup.setup) : "Not enough closed trades"}</div>
                  <div className="caption" style={{ marginTop: 5 }}>
                    {summary.bestSetup
                      ? `${summary.bestSetup.trades} trades · ${formatPct(summary.bestSetup.win_rate)} win rate · ${formatCurrency(summary.bestSetup.total_pnl)}`
                      : "Tag setups to find repeatable strengths."}
                  </div>
                </div>
                <div style={{ borderRadius: "var(--radius-md)", padding: "12px 14px", background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.18)" }}>
                  <div className="label" style={{ color: "var(--warn)", marginBottom: 6 }}>Risk drag</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                    {analytics?.max_drawdown != null ? formatCurrency(analytics.max_drawdown) : "Drawdown unavailable"}
                  </div>
                  <div className="caption" style={{ marginTop: 5 }}>
                    {summary.drawdownToProfit != null
                      ? `${formatPct(summary.drawdownToProfit * 100)} of closed-trade P&L was given back at max drawdown.`
                      : "Needs more equity curve history."}
                  </div>
                </div>
                <div style={{ borderRadius: "var(--radius-md)", padding: "12px 14px", background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
                  <div className="label" style={{ color: "var(--text-tertiary)", marginBottom: 6 }}>Largest month</div>
                  <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: toneForSigned(summary.largestMonth?.pnl) }}>
                    {summary.largestMonth ? `${summary.largestMonth.month} · ${formatCurrency(summary.largestMonth.pnl)}` : "—"}
                  </div>
                  <div className="caption" style={{ marginTop: 5 }}>Use this month as the benchmark for setup quality and position sizing discipline.</div>
                </div>
              </div>
            </section>
          )}

          {reviewSummary && (
            <section data-testid="journal-review-outcomes" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                <div>
                  <h2 className="heading-card" style={{ marginBottom: 4 }}>Process adherence</h2>
                  <div className="caption">Descriptive outcomes grouped by completed post-trade review. This is not investment advice.</div>
                </div>
                <div style={{ maxWidth: 360, padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
                  <div className="label" style={{ marginBottom: 4, color: "var(--text-tertiary)" }}>Review sample</div>
                  <div className="mono" style={{ fontSize: 16, fontWeight: 600, color: reviewSummary.sample_size_sufficient ? "var(--gain)" : "var(--warn)" }}>
                    {reviewSummary.reviewed_trades} reviewed · {reviewSummary.unreviewed_closed_trades} unreviewed
                  </div>
                  <div className="caption" style={{ marginTop: 5 }}>
                    {reviewSummary.review_data_status === "unavailable"
                      ? "Review records could not be loaded; rows are shown as not reviewed."
                      : reviewSummary.sample_size_sufficient
                        ? `At least ${reviewSummary.minimum_sample_size} completed reviews are available for descriptive comparison.`
                        : (() => {
                            const remaining = Math.max(0, reviewSummary.minimum_sample_size - reviewSummary.reviewed_trades);
                            return `Descriptive sample only — need ${remaining} more completed review${remaining === 1 ? "" : "s"} before comparing process outcomes.`;
                          })()}
                  </div>
                </div>
              </div>

              <div className="journal-edge-grid">
                <div style={{ borderRadius: "var(--radius-md)", padding: "12px 14px", background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
                  <div className="label" style={{ color: "var(--text-tertiary)", marginBottom: 6 }}>Setup-linked trades</div>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}>{reviewSummary.linked_trades}</div>
                  <div className="caption" style={{ marginTop: 5 }}>Closed trades retaining durable setup lineage.</div>
                </div>
                <div style={{ borderRadius: "var(--radius-md)", padding: "12px 14px", background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
                  <div className="label" style={{ color: "var(--warn)", marginBottom: 6 }}>Unplanned trades</div>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 600, color: reviewSummary.unplanned_trades > 0 ? "var(--warn)" : "var(--gain)" }}>{reviewSummary.unplanned_trades}</div>
                  <div className="caption" style={{ marginTop: 5 }}>Closed trades without a valid setup lineage.</div>
                </div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      {["Plan adherence", "Trades", "Win rate", "Avg P&L", "Total P&L"].map((heading) => (
                        <th key={heading} className="label" style={{ textAlign: "left", paddingBottom: 8, paddingRight: 16 }}>{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reviewSummary.plan_adherence.map((row) => {
                      const positive = row.total_pnl >= 0;
                      return (
                        <tr key={row.adherence} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                          <td style={{ padding: "10px 16px 10px 0", color: "var(--text-primary)", fontWeight: 500 }}>
                            {adherenceLabels[row.adherence]}
                          </td>
                          <td style={{ padding: "10px 16px 10px 0", color: "var(--text-secondary)" }}>{row.trades}</td>
                          <td style={{ padding: "10px 16px 10px 0" }}>
                            <span className="mono" style={{ fontWeight: 600, color: row.win_rate >= 50 ? "var(--gain)" : "var(--loss)" }}>{formatPct(row.win_rate)}</span>
                          </td>
                          <td style={{ padding: "10px 16px 10px 0" }}>
                            <span className="mono" style={{ color: toneForSigned(row.avg_pnl) }}>{formatCurrency(row.avg_pnl)}</span>
                          </td>
                          <td style={{ padding: "10px 0" }}>
                            <span className="mono" style={{ fontWeight: 600, color: positive ? "var(--gain)" : "var(--loss)" }}>{formatCurrency(row.total_pnl)}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {analytics?.r_multiple_summary && (
            <section data-testid="journal-r-multiple" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <h2 className="heading-card" style={{ marginBottom: 4 }}>Realised R-multiple</h2>
                <div className="caption">P&amp;L measured against the stop risk recorded at entry. Trades without a valid stop are excluded from R calculations.</div>
              </div>
              <div className="journal-edge-grid">
                {[
                  { label: "Expectancy", value: analytics.r_multiple_summary.expectancy_r == null ? "—" : `${analytics.r_multiple_summary.expectancy_r.toFixed(2)}R`, color: toneForSigned(analytics.r_multiple_summary.expectancy_r) },
                  { label: "Avg winner", value: analytics.r_multiple_summary.avg_winner_r == null ? "—" : `${analytics.r_multiple_summary.avg_winner_r.toFixed(2)}R`, color: "var(--gain)" },
                  { label: "Avg loser", value: analytics.r_multiple_summary.avg_loser_r == null ? "—" : `${analytics.r_multiple_summary.avg_loser_r.toFixed(2)}R`, color: "var(--loss)" },
                  { label: "Risk plan coverage", value: `${analytics.r_multiple_summary.available_trades}/${analytics.r_multiple_summary.trades}`, color: analytics.r_multiple_summary.missing_risk_plan === 0 ? "var(--gain)" : "var(--warn)" },
                ].map((card) => (
                  <div key={card.label} style={{ borderRadius: "var(--radius-md)", padding: "12px 14px", background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
                    <div className="label" style={{ color: "var(--text-tertiary)", marginBottom: 6 }}>{card.label}</div>
                    <div className="mono" style={{ fontSize: 18, fontWeight: 600, color: card.color }}>{card.value}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {analytics?.cohort_breakdown && (
            <section data-testid="journal-cohort-breakdowns" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <h2 className="heading-card" style={{ marginBottom: 4 }}>Outcome cohorts</h2>
                <div className="caption">Compare recorded outcomes by provenance and holding behavior. Small cohorts are descriptive only.</div>
              </div>
              <CohortTable id="scanner" title="Scanner provenance" caption="Groups scanner-sourced trades by the captured scan name." rows={analytics.cohort_breakdown.scanner} />
              <CohortTable
                id="sector"
                title="Sector context"
                caption={analytics.sector_context?.status === "unavailable" ? "Sector labels could not be loaded for this request." : "Uses current AlphaVyuh symbol labels; this is not benchmark attribution."}
                rows={analytics.cohort_breakdown.sector}
              />
              <CohortTable id="holding-period" title="Holding period" caption="Groups trades by recorded holding days." rows={analytics.cohort_breakdown.holding_period} />
              {analytics.mae_mfe && (
                <section data-testid="journal-mae-mfe" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div>
                    <h3 className="heading-card" style={{ marginBottom: 4 }}>MAE / MFE</h3>
                    <div className="caption">
                      {analytics.mae_mfe.intraday_trades
                        ? "Persisted broker intraday paths are used where available; missing trades use the daily OHLCV proxy."
                        : "Daily OHLCV highs and lows are an EOD proxy, not an intraday execution path. Capture a connected Zerodha path to improve coverage."}
                    </div>
                  </div>
                  <div className="caption" style={{ color: analytics.mae_mfe.status === "available" ? "var(--gain)" : "var(--warn)" }}>
                    {analytics.mae_mfe.status === "available" ? "Coverage complete" : analytics.mae_mfe.status === "partial" ? "Partial coverage" : "Coverage unavailable"}
                  </div>
                  <div className="journal-edge-grid">
                    {[
                      { label: "Avg MAE", value: formatPct(analytics.mae_mfe.avg_mae_pct), color: "var(--loss)" },
                      { label: "Avg MFE", value: formatPct(analytics.mae_mfe.avg_mfe_pct), color: "var(--gain)" },
                      { label: "Avg MAE in R", value: analytics.mae_mfe.avg_mae_r == null ? "—" : `${analytics.mae_mfe.avg_mae_r.toFixed(2)}R`, color: "var(--loss)" },
                      { label: "Avg MFE in R", value: analytics.mae_mfe.avg_mfe_r == null ? "—" : `${analytics.mae_mfe.avg_mfe_r.toFixed(2)}R`, color: "var(--gain)" },
                    ].map((card) => (
                      <div key={card.label} style={{ borderRadius: "var(--radius-md)", padding: "12px 14px", background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
                        <div className="label" style={{ color: "var(--text-tertiary)", marginBottom: 6 }}>{card.label}</div>
                        <div className="mono" style={{ fontSize: 18, fontWeight: 600, color: card.color }}>{card.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="caption">
                    {analytics.mae_mfe.trades_with_path} trade paths available · {analytics.mae_mfe.trades_without_path} missing · {analytics.mae_mfe.reason}
                  </div>
                  <MaeMfeTable
                    rows={analytics.mae_mfe.trades}
                    onCaptureIntradayPath={onCaptureIntradayPath ? handleCaptureIntradayPath : undefined}
                    captureLoadingId={captureLoadingId}
                  />
                </section>
              )}
            </section>
          )}

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
                {(() => {
                  const months = analytics!.monthly_pnl;
                  const bestAbs = Math.max(...months.map((m) => Math.abs(m.pnl)), 1);
                  return months.map(m => {
                    const pos = m.pnl >= 0;
                    const barWidth = `${Math.max(8, (Math.abs(m.pnl) / bestAbs) * 100).toFixed(1)}%`;
                    return (
                      <div key={m.month} style={{ flex: "1 1 80px", minWidth: 80, borderRadius: "var(--radius-md)", padding: "10px 12px", textAlign: "center", background: pos ? "var(--gain-subtle)" : "var(--loss-subtle)", position: "relative", overflow: "hidden" }}>
                        <div
                          aria-hidden
                          style={{
                            position: "absolute",
                            left: 0,
                            bottom: 0,
                            top: 0,
                            width: barWidth,
                            background: pos ? "rgba(45,181,116,0.18)" : "rgba(229,56,59,0.18)",
                            pointerEvents: "none",
                          }}
                        />
                        <div className="mono" style={{ position: "relative", fontSize: 11, fontWeight: 600, color: pos ? "var(--gain)" : "var(--loss)" }}>
                          {m.pnl >= 0 ? "+" : ""}₹{Math.abs(m.pnl).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                        </div>
                        <div className="caption" style={{ position: "relative", marginTop: 2 }}>{m.month}</div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {entries.length > 0 && onCalendarDateSelect && (
            <JournalCalendarHeatmap entries={entries} onSelectDate={onCalendarDateSelect} />
          )}

          {/* Setup breakdown */}
          {(analytics?.setup_breakdown?.length ?? 0) > 0 && (
            <div>
              <h2 className="heading-card" style={{ marginBottom: 12 }}>Performance by setup</h2>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      {["Setup", "Trades", "Win rate", "Avg hold", "Avg R:R", "Avg P&L", "Total P&L"].map(h => (
                        <th key={h} className="label" style={{ textAlign: "left", paddingBottom: 8, paddingRight: 16 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {analytics!.setup_breakdown.map(s => {
                      const pos = s.total_pnl >= 0;
                      return (
                        <tr key={s.setup} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                          <td style={{ padding: "10px 16px 10px 0", color: "var(--text-primary)", fontWeight: 500 }}>{formatSetupTagDisplay(s.setup)}</td>
                          <td style={{ padding: "10px 16px 10px 0", color: "var(--text-secondary)" }}>{s.trades}</td>
                          <td style={{ padding: "10px 16px 10px 0" }}>
                            <span className="mono" style={{ fontWeight: 600, color: s.win_rate >= 50 ? "var(--gain)" : "var(--loss)" }}>{s.win_rate}%</span>
                          </td>
                          <td style={{ padding: "10px 16px 10px 0", color: "var(--text-secondary)" }}>
                            {s.avg_holding_days != null ? `${s.avg_holding_days}d` : "—"}
                          </td>
                          <td style={{ padding: "10px 16px 10px 0", color: "var(--text-secondary)" }}>
                            {s.avg_risk_reward != null ? `${s.avg_risk_reward}:1` : "—"}
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

          {!hasAnalytics && (
            <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-tertiary)", fontSize: 13 }}>
              Close some trades to see analytics here.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
