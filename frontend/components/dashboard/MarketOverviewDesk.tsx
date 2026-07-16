"use client";

import { useMemo } from "react";
import type { DataHealth, MarketOverview } from "@/lib/api/types";
import { Card, Num } from "@/components/ui";
import { DataHealthBadge } from "@/components/DataHealthBadge";
import {
  breadthPhaseColor,
  breadthPhaseLabel,
  filterMajorSectorBreadth,
  formatMarketPercent,
  isMarketOverviewReady,
  safeMarketNumber,
  sectorHeatColor,
} from "@/lib/dashboard-market";
import { formatLastEodUpdated } from "@/lib/eod-freshness";
import { LiveIndexTape } from "@/components/dashboard/LiveIndexTape";

type Props = {
  data: MarketOverview;
  dataHealth: DataHealth | null;
  marketError: string;
};

function Signal({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: string }) {
  return (
    <div className="dashboard-market-signal">
      <div className="label">{label}</div>
      <Num className="dashboard-market-signal-value" style={{ color: tone ?? "var(--text-primary)" }}>{value}</Num>
      <div className="caption">{detail}</div>
    </div>
  );
}

export function MarketOverviewDesk({ data, dataHealth, marketError }: Props) {
  const ready = isMarketOverviewReady(data, marketError);
  const phaseColor = ready ? breadthPhaseColor(data.market_phase) : "var(--warn)";
  const lastUpdated = formatLastEodUpdated(dataHealth, data);
  const leadingSectors = useMemo(() => (
    filterMajorSectorBreadth(data.sector_breadth)
      .flatMap((cell) => cell.sector ? [{ label: cell.label, sector: cell.sector }] : [])
      .sort((a, b) => safeMarketNumber(b.sector.advance_breadth_pct ?? b.sector.breadth_pct) - safeMarketNumber(a.sector.advance_breadth_pct ?? a.sector.breadth_pct))
      .slice(0, 3)
  ), [data.sector_breadth]);

  const advances = safeMarketNumber(data.advances);
  const declines = safeMarketNumber(data.declines);
  const ratio = safeMarketNumber(data.advance_decline_ratio);
  const highs = safeMarketNumber(data.new_52w_highs);
  const lows = safeMarketNumber(data.new_52w_lows);

  return (
    <section className="dashboard-market-glance" data-testid="dashboard-market-desk">
      <Card padding="md">
        <div className="dashboard-market-glance-header">
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Market state</div>
            <h1 className="workspace-title dashboard-market-glance-title" style={{ color: phaseColor }}>
              {ready ? breadthPhaseLabel(data.market_phase) : "Refresh needed"}
            </h1>
            <div className="caption dashboard-market-glance-copy">
              {ready ? data.market_phase_desc : "The last loaded snapshot remains visible, but current market evidence could not be confirmed."}
            </div>
          </div>
          <div className="dashboard-market-trust" data-testid="dashboard-data-trust">
            {data.source_metadata?.coverage_pct != null ? (
              <span className="workspace-pill" title={`${data.source_metadata.symbols_count ?? data.total} symbols included`}>
                NSE universe · <Num>{safeMarketNumber(data.source_metadata.coverage_pct).toFixed(0)}%</Num>
              </span>
            ) : null}
            {data.trade_date ? <span className="workspace-pill">As of {data.trade_date}</span> : null}
            <DataHealthBadge compact />
            {lastUpdated ? <span className="caption dashboard-eod-last-updated">Updated {lastUpdated}</span> : null}
          </div>
        </div>

        <LiveIndexTape data={data} />

        <div className="dashboard-market-decision-grid" data-testid="dashboard-market-pulse">
          <Signal
            label="Advances / declines"
            value={ready ? `${advances.toLocaleString()} / ${declines.toLocaleString()}` : "—"}
            detail={ready ? `A/D ratio ${ratio.toFixed(2)}` : "Confirmation unavailable"}
            tone={ready ? (advances >= declines ? "var(--gain)" : "var(--loss)") : "var(--warn)"}
          />
          <Signal
            label="Above EMA 20 / 50 / 200"
            value={ready ? `${formatMarketPercent(safeMarketNumber(data.above_ema20_pct), 0)} · ${formatMarketPercent(safeMarketNumber(data.above_ema50_pct), 0)} · ${formatMarketPercent(safeMarketNumber(data.above_ema200_pct), 0)}` : "—"}
            detail="Short, medium, and long-term participation"
          />
          <Signal
            label="New highs / lows"
            value={ready ? `${highs} / ${lows}` : "—"}
            detail={ready ? (highs >= lows ? "Leadership exceeds breakdowns" : "Breakdowns exceed leadership") : "Confirmation unavailable"}
            tone={ready ? (highs >= lows ? "var(--gain)" : "var(--loss)") : "var(--warn)"}
          />
          <div className="dashboard-market-signal">
            <div className="label">Leading sectors</div>
            {ready && leadingSectors.length ? (
              <div className="dashboard-market-leaders">
                {leadingSectors.map(({ label, sector }) => {
                  const breadth = safeMarketNumber(sector.advance_breadth_pct ?? sector.breadth_pct);
                  return (
                    <span key={label} className="dashboard-market-leader">
                      <span>{label}</span>
                      <Num style={{ color: sectorHeatColor(breadth) }}>{formatMarketPercent(breadth, 0)}</Num>
                    </span>
                  );
                })}
              </div>
            ) : (
              <div className="caption" style={{ color: "var(--warn)" }}>Sector evidence unavailable</div>
            )}
          </div>
        </div>

        <div className="dashboard-market-glance-actions">
          <a href="/scanner" className="dashboard-primary-link">Run scanner</a>
          <a href="/data" className="dashboard-secondary-link">Data Status</a>
        </div>
      </Card>
    </section>
  );
}
