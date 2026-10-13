"use client";

import { Card } from "@/components/ui";
import { isMockMode } from "@/lib/api/client";
import { formatSetupTagDisplay } from "@/lib/setup-tag-display";
import type { JournalAnalytics as JournalAnalyticsType, JournalEntry } from "./types";
import { JournalCalendarHeatmap } from "./JournalCalendarHeatmap";
import { JournalForecast } from "./JournalForecast";
import { MonthlyTracker, SummaryRatios, TradeReturnDistribution, TradingEdgeMetrics } from "./JournalPerformance";
import { formatCurrency, formatPct, toneForSigned } from "./analytics-format";

function getLastEquityValue(analytics: JournalAnalyticsType | null) {
  const curve = analytics?.equity_curve ?? [];
  return curve.length > 0 ? curve[curve.length - 1].cumulative_pnl : null;
}

function buildReviewSummary(analytics: JournalAnalyticsType | null) {
  const setupRows = analytics?.setup_breakdown ?? [];
  const monthlyRows = analytics?.monthly_pnl ?? [];
  const totalTrades = analytics?.trading_edge?.eligible_trades ?? setupRows.reduce((sum, row) => sum + row.trades, 0);
  const totalPnl = getLastEquityValue(analytics) ?? (monthlyRows.length ? monthlyRows.reduce((sum, row) => sum + row.pnl, 0) : null);
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
  const drawdownToProfit = totalPnl != null && totalPnl > 0 && drawdownAbs && drawdownAbs > 0 ? drawdownAbs / totalPnl : null;

  const reviewFocus = weakestSetup && weakestSetup.total_pnl < 0
    ? `Compare ${weakestSetup.setup} exits with the original plans and recorded execution.`
    : "Review the plans, fills, and exit decisions behind these historical results.";

  return {
    bestSetup,
    consistencyPct,
    drawdownToProfit,
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
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cumulative realised P&L curve" style={{ width: "100%", height: 160 }} preserveAspectRatio="none">
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

function DrawdownChart({ data }: { data: { date: string; drawdown: number; drawdown_pct: number | null }[] }) {
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
  const fillPts = `${PAD},${PAD} ${pts.join(" ")} ${W - PAD},${PAD}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Recorded cash drawdown" style={{ width: "100%", height: 100 }} preserveAspectRatio="none">
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

// ── Main export ───────────────────────────────────────────────────────────────

interface JournalAnalyticsProps {
  analytics: JournalAnalyticsType | null;
  analyticsError?: string | null;
  entries?: JournalEntry[];
  onCalendarDateSelect?: (date: string) => void;
}

export function JournalAnalytics({
  analytics,
  analyticsError,
  entries = [],
  onCalendarDateSelect,
}: JournalAnalyticsProps) {
  if (analyticsError) {
    return (
      <div style={{ display: "grid", gap: 20, minWidth: 0 }}>
      <Card padding="lg" data-testid="journal-analytics-unavailable">
        <div className="label" style={{ color: "var(--warn)", marginBottom: 8 }}>Analytics unavailable</div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)" }}>
          {analyticsError} Closed trades are not being counted as empty.
        </div>
      </Card>
      <JournalForecast />
      </div>
    );
  }

  if (!analytics) return (
    <div style={{ display: "grid", gap: 20, minWidth: 0 }}>
      <Card padding="lg"><p className="caption" role="status">Loading journal analytics…</p></Card>
      <JournalForecast />
    </div>
  );

  const summary = buildReviewSummary(analytics);
  const hasAnalytics = Boolean(
    analytics?.setup_breakdown?.length ||
    analytics?.equity_curve?.length ||
    analytics?.monthly_pnl?.length ||
    analytics?.drawdown_curve?.length || analytics?.trading_edge?.closed_trades ||
    analytics?.metric_coverage?.closed_trades,
  );

  return (
    <div style={{ display: "grid", gap: 20, minWidth: 0 }}>
      {isMockMode && <p className="caption">Demo analytics example · {analytics.trading_edge?.closed_trades ?? "Sample"} synthetic closed trades. This example is separate from the editable demo trade list.</p>}
      <Card padding="lg" style={{ minWidth: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {hasAnalytics && (
            <section data-testid="journal-edge-dashboard" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                <div>
                  <h2 className="heading-card" style={{ marginBottom: 4 }}>Journal performance</h2>
                  <div className="caption">{summary.totalTrades} closed trades · {formatCurrency(summary.totalPnl)} recorded P&amp;L · {formatPct(summary.consistencyPct)} positive months</div>
                </div>
                <div style={{ maxWidth: 420, padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
                  <div className="label" style={{ marginBottom: 4, color: "var(--text-tertiary)" }}>Next review focus</div>
                  <div style={{ fontSize: 12, lineHeight: 1.55, color: "var(--text-primary)" }}>{summary.reviewFocus}</div>
                </div>
              </div>

              <TradingEdgeMetrics metrics={analytics.trading_edge} />
              {analytics.metric_coverage && (
                <p className="caption">Data coverage: {analytics.metric_coverage.eligible_trades} of {analytics.metric_coverage.closed_trades} closed records have valid completed exit dates. {analytics.metric_coverage.unknown_exit_date_count} unknown dates · {analytics.metric_coverage.future_exit_date_count} future dates · {analytics.metric_coverage.missing_return_count} missing returns · {analytics.metric_coverage.missing_cash_pnl_count} missing cash P&amp;L.</p>
              )}

              <div className="journal-review-grid">
                <div style={{ borderRadius: "var(--radius-md)", padding: "12px 14px", background: "var(--gain-subtle)", border: "1px solid var(--border-subtle)" }}>
                  <div className="label" style={{ color: "var(--gain)", marginBottom: 6 }}>Best setup</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{summary.bestSetup ? formatSetupTagDisplay(summary.bestSetup.setup) : "Not enough closed trades"}</div>
                  <div className="caption" style={{ marginTop: 5 }}>
                    {summary.bestSetup
                      ? `${summary.bestSetup.trades} trades · ${formatPct(summary.bestSetup.win_rate)} win rate · ${formatCurrency(summary.bestSetup.total_pnl)}`
                      : "Tag setups to find repeatable strengths."}
                  </div>
                </div>
                <div style={{ borderRadius: "var(--radius-md)", padding: "12px 14px", background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
                  <div className="label" style={{ color: "var(--warn)", marginBottom: 6 }}>Risk drag</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                    {analytics?.max_drawdown != null ? formatCurrency(-Math.abs(analytics.max_drawdown)) : "Drawdown unavailable"}
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
                  <div className="caption" style={{ marginTop: 5 }}>Inspect its original plans and exits alongside the rest of the sample.</div>
                </div>
              </div>
            </section>
          )}

          {hasAnalytics && <>
            <MonthlyTracker rows={analytics.monthly_tracker} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 24 }}>
              <TradeReturnDistribution distribution={analytics.trade_distribution} />
              <SummaryRatios analytics={analytics} />
            </div>
          </>}

          {/* Equity curve */}
          <div>
            <h2 className="heading-card" style={{ marginBottom: 4 }}>Equity curve</h2>
            <div className="caption" style={{ marginBottom: 12 }}>Cumulative realised P&amp;L across closed trades; account equity and open positions are not included.</div>
            <EquityCurve data={analytics?.equity_curve ?? []} />
          </div>

          {entries.length > 0 && onCalendarDateSelect && (
            <JournalCalendarHeatmap entries={entries} onSelectDate={onCalendarDateSelect} />
          )}

          {/* Setup breakdown */}
          {(analytics?.setup_breakdown?.length ?? 0) > 0 && (
            <div>
              <h2 className="heading-card" style={{ marginBottom: 12 }}>Performance by setup</h2>
              <div style={{ overflowX: "auto", maxWidth: "100%" }}>
                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      {["Setup", "Trades", "Win rate", "Avg hold", "Avg planned R:R", "Avg P&L", "Total P&L"].map(h => (
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
                              {formatCurrency(s.avg_pnl)}
                            </span>
                          </td>
                          <td style={{ padding: "10px 0" }}>
                            <span className="mono" style={{ fontWeight: 600, color: pos ? "var(--gain)" : "var(--loss)" }}>
                              {formatCurrency(s.total_pnl)}
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
              <div className="caption" style={{ marginBottom: 10 }}>Cash drawdown from the running high of recorded realised P&amp;L. Percentage drawdown requires account equity.</div>
              <DrawdownChart data={analytics!.drawdown_curve} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 120px), 1fr))", gap: 12, marginTop: 12 }}>
                {[
                  { label: "Max drawdown", val: formatCurrency(analytics.max_drawdown == null ? null : -Math.abs(analytics.max_drawdown)), neg: true },
                  { label: "Longest DD", val: analytics.longest_dd_days == null ? "—" : `${analytics.longest_dd_days}d`, neg: true },
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
      <JournalForecast metrics={analytics.trading_edge} />
    </div>
  );
}
