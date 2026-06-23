"use client";

import { Card } from "@/components/ui";
import {
  buildDashboardJournalEdge,
  type DashboardJournalEdgeInput,
  type DashboardJournalEdgeTone,
} from "@/lib/dashboard-journal-edge";
import { formatDashboardPnl } from "@/lib/dashboard-equity";

function toneColor(tone: DashboardJournalEdgeTone) {
  if (tone === "ready") return "var(--gain)";
  if (tone === "action") return "var(--accent)";
  if (tone === "warn") return "var(--warn)";
  return "var(--text-tertiary)";
}

function toneLabel(tone: DashboardJournalEdgeTone) {
  if (tone === "ready") return "Ready";
  if (tone === "action") return "Review";
  if (tone === "warn") return "Gate";
  return "Start";
}

export function DashboardJournalEdge(props: DashboardJournalEdgeInput) {
  const edge = buildDashboardJournalEdge(props);

  return (
    <Card padding="md" style={{ marginBottom: 16 }} data-testid="dashboard-journal-edge">
      <div className="dashboard-journal-header">
        <div>
          <h2 className="heading-card" style={{ fontWeight: 600, marginBottom: 4 }}>Journal edge review</h2>
          <div className="caption">Setup quality, review debt, plan completeness, mistake capture, and AI pattern readiness.</div>
        </div>
        <a href={edge.primaryAction.href} className="dashboard-journal-primary">
          {edge.primaryAction.tone === "ready" ? "Open" : "Review"}
        </a>
      </div>

      <div className="dashboard-journal-summary" data-testid="dashboard-journal-edge-summary">
        <div>
          <div className="label" style={{ marginBottom: 4, color: toneColor(edge.tone) }}>
            {toneLabel(edge.tone)}
          </div>
          <div style={{ color: "var(--text-primary)", fontSize: 14, fontWeight: 700 }}>
            {edge.headline}
          </div>
          <div className="caption" style={{ marginTop: 4 }}>{edge.summary}</div>
        </div>
      </div>

      <div className="dashboard-journal-grid">
        {edge.items.map((item) => (
          <a key={item.id} href={item.href} className="dashboard-journal-item">
            <div className="dashboard-journal-item-top">
              <span className="label">{item.label}</span>
              <span className="dashboard-journal-pill" style={{ color: toneColor(item.tone) }}>
                {toneLabel(item.tone)}
              </span>
            </div>
            <div className="dashboard-journal-value">{item.value}</div>
            <div className="caption">{item.detail}</div>
          </a>
        ))}
      </div>

      {edge.setups.length > 0 ? (
        <div className="dashboard-journal-setups" data-testid="dashboard-journal-setups">
          <div className="dashboard-journal-setups-header">
            <div>
              <div className="label" style={{ marginBottom: 4 }}>Setup leaderboard</div>
              <div className="caption">Sorted by closed-trade P&amp;L from journal analytics.</div>
            </div>
            <a href="/journal?tab=analytics" className="caption" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 700 }}>
              Analytics
            </a>
          </div>
          <div className="dashboard-journal-setup-list">
            {edge.setups.map((setup) => (
              <a key={setup.setup} href="/journal?tab=analytics" className="dashboard-journal-setup-row">
                <span className="dashboard-journal-setup-name">{setup.setup}</span>
                <span className="caption">{setup.trades} trades</span>
                <span className="mono" style={{ color: toneColor(setup.tone) }}>{setup.winRate.toFixed(0)}%</span>
                <span className="mono" style={{ color: setup.pnl >= 0 ? "var(--gain)" : "var(--loss)" }}>{formatDashboardPnl(setup.pnl)}</span>
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
