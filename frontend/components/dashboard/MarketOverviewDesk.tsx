"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { DataHealth, MarketOverview } from "@/lib/api/types";
import { Card, Num } from "@/components/ui";
import { DataHealthBadge } from "@/components/DataHealthBadge";
import { getMarketPanelEmptyCopy } from "@/lib/data-health-copy";
import {
  breadthPhaseColor,
  breadthPhaseLabel,
  emaBreadthDeltaTone,
  formatEmaBreadthTradeDate,
  filterMajorSectorBreadth,
  formatMarketPercent,
  isMarketOverviewReady,
  moverCompanyLabel,
  resolveEmaBreadthLookbackRows,
  resolveHighsLowsView,
  safeMarketNumber,
  sectorBreadthCaption,
  sectorHeatBackground,
  sectorHeatColor,
  visibleEmaBreadthLookbackOptions,
  type EmaBreadthHistoryRow,
  type EmaBreadthLookback,
  type HighsLowsPeriod,
} from "@/lib/dashboard-market";
import { formatLastEodUpdated } from "@/lib/eod-freshness";
import { LiveIndexTape } from "@/components/dashboard/LiveIndexTape";
import { MarketRegimeStrip } from "@/components/dashboard/MarketRegimeStrip";

const chipStyle = (active: boolean): CSSProperties => ({
  padding: "4px 10px",
  borderRadius: 999,
  border: `1px solid ${active ? "var(--accent)" : "var(--border-subtle)"}`,
  background: active ? "var(--accent-subtle)" : "transparent",
  color: active ? "var(--accent)" : "var(--text-tertiary)",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
});

function FilterChipGroup<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          style={chipStyle(value === option)}
        >
          {option.charAt(0).toUpperCase() + option.slice(1)}
        </button>
      ))}
    </div>
  );
}

function MarketUnavailableNote({ message }: { message: string }) {
  return (
    <div className="caption" style={{ color: "var(--warn)", lineHeight: 1.55 }} data-testid="dashboard-market-unavailable">
      {message}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  detail,
  tone,
  href,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: string;
  href?: string;
}) {
  const content = (
    <>
      <div className="label" style={{ marginBottom: 6 }}>{label}</div>
      <Num style={{ fontSize: 15, fontWeight: 600, color: tone ?? "var(--text-primary)" }}>{value}</Num>
      {detail ? <div className="caption" style={{ marginTop: 4 }}>{detail}</div> : null}
    </>
  );

  if (href) {
    return (
      <a className="dashboard-market-tile dashboard-market-tile-link" href={href} title={`Open scanner: ${label}`}>
        {content}
      </a>
    );
  }

  return <div className="dashboard-market-tile">{content}</div>;
}

function HighsLowsBarChart({ data, ready }: { data: MarketOverview; ready: boolean }) {
  const [period, setPeriod] = useState<HighsLowsPeriod>("daily");
  const view = resolveHighsLowsView(period, data);

  return (
    <Card padding="md" data-testid="dashboard-highs-lows-chart">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <h2 className="heading-card" style={{ fontWeight: 600 }}>Highs vs lows</h2>
        <FilterChipGroup options={["daily", "weekly"] as const} value={period} onChange={setPeriod} label="Highs lows period" />
      </div>
      {!ready ? (
        <MarketUnavailableNote message="Market overview is temporarily unavailable. Check Data Status before reading 52-week counts." />
      ) : view.status === "unavailable" ? (
        <MarketUnavailableNote message={view.message} />
      ) : (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 16, minHeight: 120, paddingTop: 8 }}>
          {([
            { label: "52W highs", value: view.data.highs, color: "var(--gain)" },
            { label: "52W lows", value: view.data.lows, color: "var(--loss)" },
          ] as const).map((bar) => {
            const max = Math.max(view.data.highs, view.data.lows, 1);
            const height = Math.max(12, Math.round((bar.value / max) * 88));
            return (
              <div key={bar.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <Num className="mono" style={{ fontSize: 14, fontWeight: 600, color: bar.color }}>{bar.value}</Num>
                <div style={{ width: "100%", maxWidth: 72, height: 88, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                  <div style={{ width: "56%", height, borderRadius: "4px 4px 0 0", background: bar.color, opacity: 0.85 }} />
                </div>
                <div className="caption">{bar.label}</div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function EmaAreaChart({ label, value, color }: { label: string; value: number; color: string }) {
  const width = Math.min(100, Math.max(0, value));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</span>
        <span className="mono" style={{ fontSize: 12, fontWeight: 600, color }}>{formatMarketPercent(value)}</span>
      </div>
      <svg viewBox="0 0 100 28" preserveAspectRatio="none" style={{ width: "100%", height: 28, display: "block" }} aria-hidden>
        <rect x="0" y="0" width="100" height="28" fill="var(--surface-3)" rx="2" />
        <path
          d={`M0,28 L0,${28 - (width * 0.24)} L100,${28 - (width * 0.24)} L100,28 Z`}
          fill={color}
          opacity="0.35"
        />
        <polyline
          points={`0,${28 - (width * 0.24)} 100,${28 - (width * 0.24)}`}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
}

function EmaBreadthHistoryTable({ rows }: { rows: EmaBreadthHistoryRow[] }) {
  if (!rows.length) return null;

  return (
    <div className="dashboard-ema-history-wrap" data-testid="dashboard-ema-breadth-history">
      <div className="dashboard-ema-history-title">% stocks above EMA</div>
      <table className="dashboard-ema-history-table">
        <thead>
          <tr>
            <th className="dashboard-ema-history-date">Date</th>
            <th className="dashboard-ema-history-col dashboard-ema-history-col-20">Abv EMA20</th>
            <th className="dashboard-ema-history-col dashboard-ema-history-col-50">Abv EMA50</th>
            <th className="dashboard-ema-history-col dashboard-ema-history-col-200">Abv EMA200</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const prior = rows[index + 1];
            const isLatest = index === 0;
            return (
              <tr key={row.trade_date} className={isLatest ? "dashboard-ema-history-row-latest" : undefined}>
                <td className="dashboard-ema-history-date">{formatEmaBreadthTradeDate(row.trade_date)}</td>
                <td className="dashboard-ema-history-col dashboard-ema-history-col-20">
                  <Num className="mono" style={{ color: emaBreadthDeltaTone(row.ema20, prior?.ema20) }}>
                    {formatMarketPercent(row.ema20, 2)}
                  </Num>
                </td>
                <td className="dashboard-ema-history-col dashboard-ema-history-col-50">
                  <Num className="mono" style={{ color: emaBreadthDeltaTone(row.ema50, prior?.ema50) }}>
                    {formatMarketPercent(row.ema50, 2)}
                  </Num>
                </td>
                <td className="dashboard-ema-history-col dashboard-ema-history-col-200">
                  <Num className="mono" style={{ color: emaBreadthDeltaTone(row.ema200, prior?.ema200) }}>
                    {formatMarketPercent(row.ema200, 2)}
                  </Num>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EmaBreadthPanel({ data, ready }: { data: MarketOverview; ready: boolean }) {
  const lookbackOptions = visibleEmaBreadthLookbackOptions(data);
  const [lookback, setLookback] = useState<EmaBreadthLookback>("day");
  const historyRows = resolveEmaBreadthLookbackRows(lookback, data);
  const latest = historyRows[0];

  return (
    <Card padding="md" data-testid="dashboard-ema-breadth">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <h2 className="heading-card" style={{ fontWeight: 600 }}>Breadth by EMA</h2>
        <label className="dashboard-ema-lookback-select-wrap">
          <span className="caption" style={{ marginRight: 6 }}>Lookback</span>
          <select
            className="dashboard-ema-lookback-select"
            value={lookback}
            onChange={(event) => setLookback(event.target.value as EmaBreadthLookback)}
            aria-label="EMA breadth lookback"
            data-testid="dashboard-ema-lookback-select"
          >
            {lookbackOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>
      {!ready ? (
        <MarketUnavailableNote message="EMA breadth is temporarily unavailable. Check Data Status before reading trend participation." />
      ) : !latest ? (
        <div className="caption" style={{ color: "var(--text-tertiary)", lineHeight: 1.55 }}>
          {lookback === "year"
            ? "Yearly data will appear once 12 months of history is collected."
            : "EMA breadth history is not available for this lookback yet. Check Data Status before reading trend participation."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <EmaAreaChart label="Stocks above EMA20" value={latest.ema20} color={latest.ema20 > 60 ? "var(--gain)" : latest.ema20 > 40 ? "var(--warn)" : "var(--loss)"} />
            <EmaAreaChart label="Stocks above EMA50" value={latest.ema50} color={latest.ema50 > 60 ? "var(--gain)" : latest.ema50 > 40 ? "var(--warn)" : "var(--loss)"} />
            <EmaAreaChart label="Stocks above EMA200" value={latest.ema200} color={latest.ema200 > 60 ? "var(--gain)" : latest.ema200 > 40 ? "var(--warn)" : "var(--loss)"} />
          </div>
          <EmaBreadthHistoryTable rows={historyRows} />
        </div>
      )}
    </Card>
  );
}

function MajorSectorGrid({
  data,
  ready,
  dataHealth,
  marketError,
}: {
  data: MarketOverview;
  ready: boolean;
  dataHealth: DataHealth | null;
  marketError: string;
}) {
  const sectors = useMemo(() => filterMajorSectorBreadth(data.sector_breadth), [data.sector_breadth]);
  const populated = sectors.filter((cell) => cell.sector != null).length;

  return (
    <Card padding="md" data-testid="dashboard-major-sectors">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <div>
          <h2 className="heading-card" style={{ fontWeight: 600, marginBottom: 4 }}>Major sectors</h2>
          <div className="caption" title={sectorBreadthCaption(data.sector_breadth_basis)}>
            {sectorBreadthCaption(data.sector_breadth_basis)}
          </div>
        </div>
        <a href="/data" className="caption" style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>Data Status</a>
      </div>
      {!ready || populated === 0 ? (() => {
        const emptyCopy = getMarketPanelEmptyCopy({
          panel: "sector-breadth",
          dataHealth,
          marketError,
          hasSessionDate: Boolean(data.trade_date),
        });
        return (
          <div
            className="caption"
            data-testid={emptyCopy.testId}
            style={{ color: emptyCopy.tone === "warn" ? "var(--warn)" : undefined, lineHeight: 1.55, padding: "8px 0" }}
          >
            {emptyCopy.message}
          </div>
        );
      })() : (
        <div className="dashboard-market-sector-grid">
          {sectors.map((cell) => {
            const row = cell.sector;
            const breadth = row ? safeMarketNumber(row.advance_breadth_pct ?? row.breadth_pct) : NaN;
            const avg = row ? safeMarketNumber(row.avg_pct_change) : NaN;
            const missing = !row;
            return (
              <div
                key={cell.label}
                className={`dashboard-market-sector-cell${missing ? " dashboard-market-sector-cell-missing" : ""}`}
                style={{
                  background: missing ? "var(--surface-2)" : sectorHeatBackground(breadth),
                  borderColor: "var(--border-subtle)",
                }}
                title={missing ? "Sector data unavailable for this session" : `${cell.label}: ${formatMarketPercent(breadth, 0)} of stocks advanced vs prior close`}
              >
                <div className="label" style={{ marginBottom: 6, fontSize: 10 }}>{cell.label}</div>
                {missing ? (
                  <div className="caption dashboard-sector-no-data">No data</div>
                ) : (
                  <>
                    <Num className="mono" style={{ fontSize: 14, fontWeight: 600, color: sectorHeatColor(breadth) }}>
                      {formatMarketPercent(breadth, 0)}
                    </Num>
                    <div className="mono" style={{ fontSize: 11, marginTop: 4, color: avg >= 0 ? "var(--gain)" : "var(--loss)" }}>
                      {Number.isFinite(avg) ? `${avg >= 0 ? "+" : ""}${avg.toFixed(2)}%` : "—"}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function MoversList({
  title,
  items,
  variant,
  dataHealth,
  marketError,
  hasSessionDate,
}: {
  title: string;
  items: MarketOverview["top_gainers"];
  variant: "gain" | "loss";
  dataHealth: DataHealth | null;
  marketError: string;
  hasSessionDate: boolean;
}) {
  const color = variant === "gain" ? "var(--gain)" : "var(--loss)";
  const safeItems = Array.isArray(items) ? items : [];
  const emptyCopy = getMarketPanelEmptyCopy({ panel: "movers", dataHealth, marketError, hasSessionDate });

  return (
    <Card padding="md" data-testid={variant === "gain" ? "dashboard-top-gainers" : "dashboard-top-losers"}>
      <h2 className="heading-card" style={{ fontWeight: 600, marginBottom: 12 }}>{title}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {safeItems.length === 0 ? (
          <div className="caption" data-testid={emptyCopy.testId} style={{ color: emptyCopy.tone === "warn" ? "var(--warn)" : undefined, lineHeight: 1.55 }}>
            {emptyCopy.message}
          </div>
        ) : (
          safeItems.slice(0, 5).map((item) => {
            const close = safeMarketNumber(item.close, NaN);
            const pct = safeMarketNumber(item.pct_change, NaN);
            const companyLabel = moverCompanyLabel(item.symbol, item.company_name);
            return (
              <a
                key={item.symbol}
                href={`/watchlist?symbol=${item.symbol}`}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border-subtle)", textDecoration: "none" }}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="mono" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{item.symbol}</div>
                  {companyLabel ? (
                    <div className="caption" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>{companyLabel}</div>
                  ) : null}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                  <div className="mono" style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>
                    {Number.isFinite(close) ? `₹${close.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "—"}
                  </div>
                  <div className="mono" style={{ fontSize: 11, fontWeight: 600, color }}>
                    {Number.isFinite(pct) ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : "—"}
                  </div>
                </div>
              </a>
            );
          })
        )}
      </div>
    </Card>
  );
}

type Props = {
  data: MarketOverview;
  dataHealth: DataHealth | null;
  marketError: string;
};

export function MarketOverviewDesk({ data, dataHealth, marketError }: Props) {
  const ready = isMarketOverviewReady(data, marketError);
  const phaseColor = breadthPhaseColor(data.market_phase);
  const adTone = data.advances >= data.declines ? "var(--gain)" : "var(--loss)";
  const lastUpdated = formatLastEodUpdated(dataHealth, data);

  return (
    <section className="dashboard-market-desk" data-testid="dashboard-market-desk">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <div>
          <h1 className="workspace-title" style={{ fontSize: "clamp(20px, 2.4vw, 28px)", fontWeight: 600, marginBottom: 4 }}>Market overview</h1>
          <div className="caption">Live index quotes with NSE breadth, sector map, and leadership.</div>
        </div>
        <div data-testid="dashboard-data-trust" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <a href="/analytics" className="workspace-chip-button" style={{ textDecoration: "none" }}>
            Breadth history
          </a>
          {data.source_metadata?.coverage_pct != null && (
            <span className="workspace-pill" title={`${data.source_metadata.symbols_count ?? data.total} symbols included`}>
              NSE universe · <Num>{safeMarketNumber(data.source_metadata.coverage_pct).toFixed(0)}%</Num>
            </span>
          )}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
            {data.trade_date && (
              <span className="workspace-pill" title="Breadth and sector stats as of this trade date">
                As of {data.trade_date}
              </span>
            )}
            {lastUpdated ? (
              <span className="caption dashboard-eod-last-updated" data-testid="dashboard-last-updated">
                Last updated: {lastUpdated}
              </span>
            ) : null}
          </div>
          <DataHealthBadge compact />
        </div>
      </div>

      <LiveIndexTape data={data} />

      <MarketRegimeStrip data={data} ready={ready} />

      <MajorSectorGrid data={data} ready={ready} dataHealth={dataHealth} marketError={marketError} />

      <div className="dashboard-market-summary-row" data-testid="dashboard-market-pulse">
        <SummaryTile
          label="Market breadth"
          value={ready ? breadthPhaseLabel(data.market_phase) : "Unavailable"}
          detail={ready ? data.market_phase_desc : "Check Data Status before reading breadth."}
          tone={ready ? phaseColor : "var(--warn)"}
        />
        <SummaryTile
          label="Advances / declines"
          value={ready ? `${safeMarketNumber(data.advances).toLocaleString()} / ${safeMarketNumber(data.declines).toLocaleString()}` : "—"}
          detail={ready ? `A/D ${safeMarketNumber(data.advance_decline_ratio).toFixed(2)}` : undefined}
          tone={ready ? adTone : "var(--warn)"}
        />
        <SummaryTile
          label="New 52W highs"
          value={ready ? String(safeMarketNumber(data.new_52w_highs)) : "—"}
          tone={ready ? "var(--gain)" : "var(--warn)"}
          href={ready ? "/scanner?preset=high_52w_breakout" : undefined}
        />
        <SummaryTile
          label="New 52W lows"
          value={ready ? String(safeMarketNumber(data.new_52w_lows)) : "—"}
          tone={ready ? "var(--loss)" : "var(--warn)"}
          href={ready ? "/scanner?preset=low_52w_breakout" : undefined}
        />
      </div>

      <div className="dashboard-market-charts-row">
        <HighsLowsBarChart data={data} ready={ready} />
        <EmaBreadthPanel data={data} ready={ready} />
      </div>

      <div className="dashboard-market-movers-row">
        <MoversList title="Top gainers" items={data.top_gainers} variant="gain" dataHealth={dataHealth} marketError={marketError} hasSessionDate={Boolean(data.trade_date)} />
        <MoversList title="Top losers" items={data.top_losers} variant="loss" dataHealth={dataHealth} marketError={marketError} hasSessionDate={Boolean(data.trade_date)} />
      </div>
    </section>
  );
}
