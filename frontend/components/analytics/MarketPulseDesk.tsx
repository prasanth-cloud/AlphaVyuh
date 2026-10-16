"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BreadthLineChart, SectorLeaderboard, SectorParticipationMap } from "@/components/analytics/MarketPulseCharts";
import { Card, EmptyState, EyebrowLabel, Num } from "@/components/ui";
import { getMarketAnalytics, type MarketAnalyticsBundle } from "@/lib/api";
import { formatMarketDataSource } from "@/lib/data-copy";
import { describeMarketDataError } from "@/lib/data-errors";

function formatMetric(value: number | null, suffix = ""): string {
  return value == null ? "—" : `${value.toLocaleString("en-IN", { maximumFractionDigits: 1 })}${suffix}`;
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <Card padding="md"><div className="label">{label}</div><Num className="market-pulse-summary-value">{value}</Num><div className="caption">{detail}</div></Card>;
}

export function MarketPulseDesk() {
  const [data, setData] = useState<MarketAnalyticsBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await getMarketAnalytics());
    } catch (reason) {
      setData(null);
      setError(describeMarketDataError(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return <div className="market-pulse-loading" aria-label="Loading Market Pulse"><div /><div /><div /></div>;
  }
  if (!data) {
    return <EmptyState title="Market Pulse is temporarily unavailable" description={error || "The latest complete EOD history could not be loaded."} action={{ label: "Retry", onClick: load }} />;
  }

  const partial = data.completeness.status !== "complete" || data.completeness.sessions_available < data.completeness.sessions_requested;
  const source = formatMarketDataSource(data.source_metadata?.source_name, "AlphaVyuh EOD market data");
  const summary = data.summary;

  return (
    <div className="market-pulse-page">
      <header className="market-pulse-header">
        <div>
          <EyebrowLabel>Market context</EyebrowLabel>
          <h1 className="app-page-title">Market Pulse</h1>
          <p className="caption">Breadth, participation, and relative sector context from completed NSE EQ sessions. Informational only.</p>
        </div>
        <div className="market-pulse-actions"><Link href="/data" className="workspace-chip-button">Data status</Link><Link href="/scanner" className="workspace-chip-button active">Open scanner →</Link></div>
      </header>

      <div className="market-pulse-provenance" data-testid="market-pulse-provenance">
        <span><strong>{data.trade_date}</strong> latest completed session</span>
        <span>{source}</span>
        <span>{data.phase} participation</span>
        {data.completeness.coverage_pct != null && <span>{data.completeness.coverage_pct.toFixed(1)}% universe coverage</span>}
      </div>

      {partial && (
        <div className="market-pulse-notice" role="status" data-testid="market-pulse-partial-history">
          Showing {data.completeness.sessions_available} of {data.completeness.sessions_requested} requested sessions. Gaps stay visible; missing history is not filled with estimates.
        </div>
      )}

      <section className="market-pulse-summary" aria-label="Latest market breadth summary">
        <SummaryCard label="A/D ratio" value={formatMetric(summary.advance_decline_ratio)} detail={`${formatMetric(summary.advances)} advances · ${formatMetric(summary.declines)} declines`} />
        <SummaryCard label="Above EMA 20" value={formatMetric(summary.above_ema20_pct, "%")} detail="Short-term participation" />
        <SummaryCard label="Above EMA 200" value={formatMetric(summary.above_ema200_pct, "%")} detail="Long-term participation" />
        <SummaryCard label="52-week extremes" value={`${formatMetric(summary.new_52w_highs)} / ${formatMetric(summary.new_52w_lows)}`} detail="New highs / new lows" />
      </section>

      <section className="market-pulse-grid">
        <Card padding="lg"><div className="market-pulse-card-head"><div><h2>Market breadth trend</h2><p className="caption">Advances and declines on one shared scale.</p></div><span className="label">{data.lookback_sessions} sessions</span></div><BreadthLineChart rows={data.breadth_history} ariaLabel="Advances and declines by completed session" series={[{ label: "Advances", color: "var(--accent)", values: data.breadth_history.map((row) => row.advances) }, { label: "Declines", color: "var(--text-tertiary)", values: data.breadth_history.map((row) => row.declines) }]} /></Card>
        <Card padding="lg"><div className="market-pulse-card-head"><div><h2>EMA participation</h2><p className="caption">Share of eligible NSE EQ symbols above each average.</p></div></div><BreadthLineChart rows={data.breadth_history} ariaLabel="Share of symbols above 20, 50, and 200-session exponential moving averages" series={[{ label: "EMA 20", color: "var(--accent)", values: data.breadth_history.map((row) => row.above_ema20_pct) }, { label: "EMA 50", color: "var(--text-secondary)", values: data.breadth_history.map((row) => row.above_ema50_pct) }, { label: "EMA 200", color: "var(--text-tertiary)", values: data.breadth_history.map((row) => row.above_ema200_pct) }]} /></Card>
      </section>

      <section className="market-pulse-lower-grid">
        <Card padding="lg"><div className="market-pulse-card-head"><div><h2>{data.rotation_label}</h2><p className="caption">Relative ranks, centered at 50. This is not a canonical RRG.</p></div></div><SectorParticipationMap points={data.rotation_points} /><p className="caption market-pulse-methodology">{data.rotation_methodology}</p></Card>
        <Card padding="lg"><div className="market-pulse-card-head"><div><h2>Sector participation</h2><p className="caption">Equal-weight sector returns and latest-session breadth.</p></div></div><SectorLeaderboard rows={data.sector_leaderboard} /></Card>
      </section>

      <footer className="market-pulse-footer"><span>Universe: active NSE EQ symbols with eligible EOD rows.</span><span>Market Pulse describes completed data. It does not rank stocks or provide trade calls.</span></footer>
    </div>
  );
}
