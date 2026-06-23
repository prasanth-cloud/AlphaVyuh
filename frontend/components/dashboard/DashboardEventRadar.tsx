"use client";

import { Card } from "@/components/ui";
import {
  buildDashboardEventRadar,
  type DashboardEventRadarInput,
  type DashboardEventTone,
} from "@/lib/dashboard-event-radar";

function toneColor(tone: DashboardEventTone) {
  if (tone === "ready") return "var(--gain)";
  if (tone === "action") return "var(--accent)";
  if (tone === "warn") return "var(--warn)";
  return "var(--text-tertiary)";
}

function toneLabel(tone: DashboardEventTone) {
  if (tone === "ready") return "Clear";
  if (tone === "action") return "Check";
  if (tone === "warn") return "Gate";
  return "Start";
}

export function DashboardEventRadar(props: DashboardEventRadarInput) {
  const radar = buildDashboardEventRadar(props);

  return (
    <Card padding="md" style={{ marginBottom: 16 }} data-testid="dashboard-event-radar">
      <div className="dashboard-event-header">
        <div>
          <h2 className="heading-card" style={{ fontWeight: 600, marginBottom: 4 }}>Event risk radar</h2>
          <div className="caption">Calendar coverage, data freshness, alerts, open exposure, and manual event checks.</div>
        </div>
        <a href={radar.primaryAction.href} className="dashboard-event-primary">
          {radar.primaryAction.tone === "ready" ? "Open" : "Review"}
        </a>
      </div>

      <div className="dashboard-event-summary" data-testid="dashboard-event-summary">
        <div>
          <div className="label" style={{ marginBottom: 4, color: toneColor(radar.tone) }}>
            {toneLabel(radar.tone)}
          </div>
          <div style={{ color: "var(--text-primary)", fontSize: 14, fontWeight: 700 }}>
            {radar.headline}
          </div>
          <div className="caption" style={{ marginTop: 4 }}>{radar.summary}</div>
        </div>
      </div>

      <div className="dashboard-event-grid">
        {radar.items.map((item) => (
          <a key={item.id} href={item.href} className="dashboard-event-item">
            <div className="dashboard-event-item-top">
              <span className="label">{item.label}</span>
              <span className="dashboard-event-pill" style={{ color: toneColor(item.tone) }}>
                {toneLabel(item.tone)}
              </span>
            </div>
            <div className="dashboard-event-value">{item.value}</div>
            <div className="caption">{item.detail}</div>
          </a>
        ))}
      </div>

      {radar.symbols.length > 0 ? (
        <div className="dashboard-event-symbols" data-testid="dashboard-event-symbols">
          <div className="dashboard-event-symbols-header">
            <div>
              <div className="label" style={{ marginBottom: 4 }}>Manual event check queue</div>
              <div className="caption">Priority symbols to verify against earnings, macro, and corporate events.</div>
            </div>
            <a href="/watchlist" className="caption" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 700 }}>
              Watchlist
            </a>
          </div>
          <div className="dashboard-event-symbol-list">
            {radar.symbols.map((item) => (
              <a key={item.symbol} href={item.href} className="dashboard-event-symbol-row" aria-label={`Open ${item.symbol} chart for event review`}>
                <span className="mono">{item.symbol}</span>
                <span className="dashboard-event-symbol-label">{item.label}</span>
                <span className="caption">{item.detail}</span>
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
