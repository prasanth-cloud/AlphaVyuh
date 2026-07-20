"use client";

import type {
  MarketBreadthHistoryPoint,
  MarketRotationPoint,
  MarketSectorParticipation,
} from "@/lib/api";

type LineSeries = {
  label: string;
  color: string;
  values: Array<number | null>;
};

function linePath(values: Array<number | null>, min: number, max: number, width: number, height: number): string {
  const padX = 10;
  const padY = 12;
  const span = max - min || 1;
  const step = values.length > 1 ? (width - padX * 2) / (values.length - 1) : 0;
  let drawing = false;
  return values.map((value, index) => {
    if (value == null) {
      drawing = false;
      return "";
    }
    const x = padX + index * step;
    const y = height - padY - ((value - min) / span) * (height - padY * 2);
    const command = drawing ? "L" : "M";
    drawing = true;
    return `${command}${x.toFixed(1)},${y.toFixed(1)}`;
  }).filter(Boolean).join(" ");
}

export function BreadthLineChart({
  rows,
  series,
  ariaLabel,
}: {
  rows: MarketBreadthHistoryPoint[];
  series: LineSeries[];
  ariaLabel: string;
}) {
  const width = 720;
  const height = 230;
  const allValues = series.flatMap((item) => item.values).filter((value): value is number => value != null);
  const min = allValues.length ? Math.min(...allValues) : 0;
  const max = allValues.length ? Math.max(...allValues) : 1;

  return (
    <div className="market-pulse-chart" data-testid="market-pulse-line-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
        <rect x="0" y="0" width={width} height={height} rx="10" fill="var(--surface-2)" />
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = 12 + ratio * (height - 24);
          return <line key={ratio} x1="10" x2={width - 10} y1={y} y2={y} stroke="var(--border-subtle)" strokeDasharray="3 5" />;
        })}
        {series.map((item) => (
          <path
            key={item.label}
            d={linePath(item.values, min, max, width, height)}
            fill="none"
            stroke={item.color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
      <div className="market-pulse-legend">
        {series.map((item) => {
          const latest = item.values.findLast((value) => value != null);
          return (
            <span key={item.label}>
              <i style={{ background: item.color }} aria-hidden="true" />
              {item.label}
              <strong className="mono">{latest == null ? "—" : latest.toLocaleString("en-IN", { maximumFractionDigits: 1 })}</strong>
            </span>
          );
        })}
        <span className="caption market-pulse-range">Shared scale {min.toFixed(1)}–{max.toFixed(1)}</span>
      </div>
      <details className="market-pulse-values">
        <summary>View session values</summary>
        <div className="market-pulse-table-scroll">
          <table>
            <thead><tr><th>Date</th>{series.map((item) => <th key={item.label}>{item.label}</th>)}</tr></thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.date}>
                  <td>{row.date}</td>
                  {series.map((item) => <td key={item.label}>{item.values[index] == null ? "—" : item.values[index]?.toFixed(1)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

export function SectorParticipationMap({ points }: { points: MarketRotationPoint[] }) {
  const width = 720;
  const height = 390;
  const pad = 48;
  const plotWidth = width - pad * 2;
  const plotHeight = height - pad * 2;
  const x = (score: number) => pad + (score / 100) * plotWidth;
  const y = (score: number) => pad + plotHeight - (score / 100) * plotHeight;

  return (
    <div className="market-pulse-chart" data-testid="market-pulse-participation-map">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Sector participation map with relative strength and momentum percentile axes">
        <rect x="0" y="0" width={width} height={height} rx="10" fill="var(--surface-2)" />
        <line x1={x(50)} x2={x(50)} y1={pad} y2={height - pad} stroke="var(--border-default)" strokeDasharray="4 5" />
        <line x1={pad} x2={width - pad} y1={y(50)} y2={y(50)} stroke="var(--border-default)" strokeDasharray="4 5" />
        <text x={pad + 8} y={pad + 18} className="market-pulse-svg-label">Improving</text>
        <text x={width - pad - 54} y={pad + 18} textAnchor="end" className="market-pulse-svg-label">Leading</text>
        <text x={pad + 8} y={height - pad - 10} className="market-pulse-svg-label">Lagging</text>
        <text x={width - pad - 8} y={height - pad - 10} textAnchor="end" className="market-pulse-svg-label">Weakening</text>
        {points.map((point) => (
          <g key={point.sector}>
            <circle cx={x(point.strength_score)} cy={y(point.momentum_score)} r="7" fill="var(--accent)" />
            <text x={x(point.strength_score)} y={y(point.momentum_score) - 12} textAnchor="middle" className="market-pulse-svg-sector">
              {point.sector.length > 18 ? `${point.sector.slice(0, 16)}…` : point.sector}
            </text>
          </g>
        ))}
        <text x={width / 2} y={height - 12} textAnchor="middle" className="market-pulse-svg-axis">20-session relative strength percentile →</text>
        <text x="14" y={height / 2} textAnchor="middle" className="market-pulse-svg-axis" transform={`rotate(-90 14 ${height / 2})`}>5-session momentum change percentile →</text>
      </svg>
      <details className="market-pulse-values">
        <summary>View map values</summary>
        <div className="market-pulse-table-scroll">
          <table>
            <thead><tr><th>Sector</th><th>Strength</th><th>Momentum</th><th>State</th><th>20-session return</th></tr></thead>
            <tbody>{points.map((point) => <tr key={point.sector}><td>{point.sector}</td><td>{point.strength_score.toFixed(1)}</td><td>{point.momentum_score.toFixed(1)}</td><td>{point.quadrant}</td><td>{point.return_20d_pct == null ? "—" : `${point.return_20d_pct.toFixed(2)}%`}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

export function SectorLeaderboard({ rows }: { rows: MarketSectorParticipation[] }) {
  return (
    <div className="market-pulse-table-scroll" data-testid="market-pulse-sector-table">
      <table className="market-pulse-sector-table">
        <thead>
          <tr>
            <th>Sector</th>
            <th aria-label="20 sessions"><span className="market-pulse-header-full" aria-hidden="true">20 sessions</span><span className="market-pulse-header-compact" aria-hidden="true">20S</span></th>
            <th aria-label="5 sessions"><span className="market-pulse-header-full" aria-hidden="true">5 sessions</span><span className="market-pulse-header-compact" aria-hidden="true">5S</span></th>
            <th>Breadth</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.sector}>
              <td><strong><span className="market-pulse-sector-rank">{row.rank}.</span>{row.sector}</strong><span>{row.constituents} constituents</span></td>
              <td className="mono">{row.return_20d_pct == null ? "—" : `${row.return_20d_pct > 0 ? "+" : ""}${row.return_20d_pct.toFixed(2)}%`}</td>
              <td className="mono">{row.return_5d_pct == null ? "—" : `${row.return_5d_pct > 0 ? "+" : ""}${row.return_5d_pct.toFixed(2)}%`}</td>
              <td className="mono">{row.breadth_pct == null ? "—" : `${row.breadth_pct.toFixed(1)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
