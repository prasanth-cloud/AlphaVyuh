import type { CSSProperties } from "react";
import type { JournalAnalytics, JournalTradeMetrics } from "@/lib/api/types";
import { formatCurrency, formatPct, formatRatio, toneForSigned } from "./analytics-format";

const metricStyle: CSSProperties = {
  padding: "12px 14px", borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-subtle)", background: "var(--surface-2)", minWidth: 0,
};
const cellStyle: CSSProperties = { padding: "11px 12px", whiteSpace: "nowrap", textAlign: "right" };

export function TradingEdgeMetrics({ metrics }: { metrics: JournalTradeMetrics | null | undefined }) {
  const cards = [
    { label: "Average gain", value: formatPct(metrics?.avg_gain_pct), detail: `${formatCurrency(metrics?.avg_win_cash)} average cash win`, color: "var(--gain)" },
    { label: "Average loss", value: metrics?.avg_loss_pct == null ? "—" : `-${formatPct(metrics.avg_loss_pct)}`, detail: `${formatCurrency(metrics?.avg_loss_cash == null ? null : -metrics.avg_loss_cash)} average cash loss`, color: "var(--loss)" },
    { label: "Batting average", value: formatPct(metrics?.win_rate_pct), detail: "Winning trades / known returns", color: "var(--text-primary)" },
    { label: "Expectancy / trade", value: formatCurrency(metrics?.expectancy_cash), detail: metrics ? `${metrics.cash_trade_count} trades with cash P&L` : "Cash P&L coverage unavailable", color: toneForSigned(metrics?.expectancy_cash) },
    { label: "Return expectancy", value: formatPct(metrics?.expectancy_pct), detail: "Mean trade return, including breakevens", color: toneForSigned(metrics?.expectancy_pct) },
    { label: "Closed trades", value: metrics?.eligible_trades == null ? "—" : String(metrics.eligible_trades), detail: "With a valid completed exit date", color: "var(--text-primary)" },
  ];
  return (
    <section data-testid="journal-trading-edge">
      <h2 className="heading-card" style={{ marginBottom: 4 }}>Trading edge</h2>
      <p className="caption" style={{ marginBottom: 12 }}>
        Historical results describe this sample. They do not establish future performance.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 10 }}>
        {cards.map(card => (
          <div key={card.label} style={metricStyle}>
            <div className="label">{card.label}</div>
            <div className="mono" style={{ fontSize: 20, fontWeight: 600, color: card.color, marginTop: 6 }}>{card.value}</div>
            <div className="caption" style={{ marginTop: 5 }}>{card.detail}</div>
          </div>
        ))}
      </div>
      <p className="caption" style={{ marginTop: 10 }}>
        {metrics ? `${metrics.return_trade_count} of ${metrics.eligible_trades} eligible trades have known percentage returns. ${metrics.wins} wins · ${metrics.losses} losses · ${metrics.breakevens} breakevens.` : "Trade-return metrics are unavailable for this response."}
      </p>
    </section>
  );
}

export function MonthlyTracker({ rows }: { rows: JournalAnalytics["monthly_tracker"] }) {
  return (
    <section style={{ minWidth: 0 }} data-testid="journal-monthly-tracker">
      <h2 className="heading-card" style={{ marginBottom: 4 }}>Monthly tracker</h2>
      <p className="caption" style={{ marginBottom: 12 }}>Grouped by exit month. Gain/loss averages and win rate use known trade returns; holding days use valid entry and exit dates.</p>
      {rows?.length ? (
        <div style={{ overflowX: "auto", maxWidth: "100%", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}>
          <table aria-label="Monthly trading tracker" style={{ borderCollapse: "collapse", width: "100%", minWidth: 920, fontSize: 12 }}>
            <thead style={{ background: "var(--surface-2)" }}>
              <tr>{["Month", "Avg gain", "Avg loss", "Win rate", "Trades", "Largest gain", "Largest loss", "Held winners", "Held losers"].map(label => (
                <th key={label} className="label" scope="col" style={cellStyle}>{label}</th>
              ))}</tr>
            </thead>
            <tbody>{rows.map(row => (
              <tr key={row.month} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <th scope="row" style={{ ...cellStyle, textAlign: "left", fontWeight: 600 }}>{row.month}</th>
                <td className="mono" style={{ ...cellStyle, color: "var(--gain)" }}>{formatPct(row.avg_gain_pct)}</td>
                <td className="mono" style={{ ...cellStyle, color: "var(--loss)" }}>{row.avg_loss_pct == null ? "—" : `-${formatPct(row.avg_loss_pct)}`}</td>
                <td className="mono" style={cellStyle}>{formatPct(row.win_rate_pct)}</td>
                <td className="mono" style={cellStyle}>{row.eligible_trades}<span className="caption"> / {row.return_trade_count} returns</span></td>
                <td className="mono" style={{ ...cellStyle, color: "var(--gain)" }}>{formatPct(row.largest_gain_pct)}</td>
                <td className="mono" style={{ ...cellStyle, color: "var(--loss)" }}>{row.largest_loss_pct == null ? "—" : `-${formatPct(row.largest_loss_pct)}`}</td>
                <td className="mono" style={cellStyle}>{row.avg_winner_holding_days == null ? "—" : `${row.avg_winner_holding_days.toFixed(1)}d`} <span className="caption">({row.winner_holding_count})</span></td>
                <td className="mono" style={cellStyle}>{row.avg_loser_holding_days == null ? "—" : `${row.avg_loser_holding_days.toFixed(1)}d`} <span className="caption">({row.loser_holding_count})</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <p className="caption">{rows ? "No eligible closed trades to group by month." : "Monthly metrics are unavailable for this response."}</p>}
    </section>
  );
}

export function buildReturnHistogram(values: readonly number[]) {
  const finite = values.filter(value => Number.isFinite(value));
  if (!finite.length) return [];
  let min = finite[0], max = finite[0];
  for (const value of finite) { min = Math.min(min, value); max = Math.max(max, value); }
  if (!Number.isFinite(max - min)) return [];
  const width = Math.max(2, Math.ceil((max - min) / 24 / 2) * 2);
  const start = Math.floor(min / width) * width;
  const end = Math.max(start + width, Math.ceil(max / width) * width);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(end - start)) return [];
  const count = Math.max(1, Math.round((end - start) / width));
  const buckets = Array.from({ length: count }, (_, index) => ({
    fromPct: start + index * width, toPct: start + (index + 1) * width, count: 0,
  }));
  for (const value of finite) {
    const index = Math.min(count - 1, Math.max(0, Math.floor((value - start) / width)));
    buckets[index].count += 1;
  }
  return buckets;
}

export function TradeReturnDistribution({ distribution }: { distribution: JournalAnalytics["trade_distribution"] }) {
  const buckets = buildReturnHistogram(distribution?.returns_pct ?? []);
  const peak = Math.max(1, ...buckets.map(bucket => bucket.count));
  const W = 600, H = 210, pad = 30, plotHeight = 150;
  const barWidth = (W - pad * 2) / Math.max(1, buckets.length);
  return (
    <section data-testid="journal-return-distribution" style={{ minWidth: 0 }}>
      <h2 className="heading-card" style={{ marginBottom: 4 }}>Trade-return distribution</h2>
      <p className="caption">Actual closed-trade percentage returns, grouped into equal-width bins.</p>
      {buckets.length ? (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Return histogram for ${distribution?.returns_pct.length ?? 0} trades`} style={{ width: "100%", height: "auto", display: "block", marginTop: 10 }}>
            <line x1={pad} x2={W - pad} y1={plotHeight + 15} y2={plotHeight + 15} stroke="var(--border-default)" />
            {buckets.map((bucket, index) => {
              const height = bucket.count / peak * plotHeight;
              const x = pad + index * barWidth;
              return <g key={bucket.fromPct}>
                <rect x={x + 2} y={plotHeight + 15 - height} width={Math.max(1, barWidth - 4)} height={height} fill={distribution?.gain_count === 0 && distribution?.loss_count === 0 ? "var(--text-tertiary)" : bucket.toPct <= 0 ? "var(--loss)" : "var(--gain)"} opacity={0.8}>
                  <title>{bucket.fromPct}% to {bucket.toPct}%: {bucket.count} trades</title>
                </rect>
                <text x={x + barWidth / 2} y={plotHeight + 10 - height} textAnchor="middle" fill="var(--text-primary)" fontSize={12}>{bucket.count || ""}</text>
                {(buckets.length <= 12 || index % 2 === 0) && <text x={x + 2} y={plotHeight + 34} fill="var(--text-tertiary)" fontSize={11}>{bucket.fromPct}%</text>}
              </g>;
            })}
          </svg>
          <div className="caption">{distribution?.gain_count ?? 0} gains · {distribution?.loss_count ?? 0} losses · {distribution?.breakeven_count ?? 0} breakevens · {distribution?.missing_return_count ?? 0} missing returns</div>
          <details style={{ marginTop: 10, fontSize: 12 }}>
            <summary style={{ cursor: "pointer", color: "var(--text-secondary)" }}>Return bands and counts</summary>
            <ul className="caption" style={{ paddingLeft: 18, marginTop: 8 }}>{buckets.map((bucket, index) => (
              <li key={bucket.fromPct}>{bucket.fromPct}% ≤ return {index === buckets.length - 1 ? "≤" : "<"} {bucket.toPct}%: {bucket.count} trades</li>
            ))}</ul>
          </details>
        </>
      ) : <p className="caption" style={{ padding: "30px 0" }}>{distribution?.returns_pct.length ? "Return range cannot be charted safely." : distribution ? "No known trade returns in the eligible history." : "Return distribution is unavailable for this response."}</p>}
    </section>
  );
}

export function SummaryRatios({ analytics }: { analytics: JournalAnalytics }) {
  const edge = analytics.trading_edge;
  const ratios = [
    { label: "Payoff ratio", value: edge?.payoff_ratio, detail: "Average gain % / average loss %" },
    { label: "Adjusted win/loss", value: edge?.adjusted_win_loss_ratio, detail: "Gain % × wins / (loss % × losses)" },
    { label: "Profit factor", value: edge?.profit_factor_cash, detail: "Eligible cash gains / eligible cash losses" },
    { label: "Recovery factor", value: analytics.recovery_factor, detail: "Recorded cash P&L / cash drawdown history" },
  ];
  return <section data-testid="journal-summary-ratios">
    <h2 className="heading-card" style={{ marginBottom: 4 }}>Summary ratios</h2>
    <p className="caption" style={{ marginBottom: 12 }}>Payoff and profit factor use eligible completed trades. Recovery uses the recorded cash curve. These are different measures; unknown denominators remain unavailable.</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
      {ratios.map(ratio => <div key={ratio.label} style={metricStyle}>
        <div className="label">{ratio.label}</div>
        <div className="mono" style={{ fontSize: 20, fontWeight: 600, margin: "6px 0" }}>{formatRatio(ratio.value)}</div>
        <div className="caption">{ratio.detail}</div>
      </div>)}
    </div>
  </section>;
}
