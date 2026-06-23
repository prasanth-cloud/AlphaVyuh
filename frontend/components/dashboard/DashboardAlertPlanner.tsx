"use client";

import { Card } from "@/components/ui";
import {
  buildDashboardAlertPlanner,
  type DashboardAlertPlannerInput,
  type DashboardAlertPlannerTone,
} from "@/lib/dashboard-alert-planner";

function toneColor(tone: DashboardAlertPlannerTone) {
  if (tone === "ready") return "var(--gain)";
  if (tone === "action") return "var(--accent)";
  if (tone === "warn") return "var(--warn)";
  return "var(--text-tertiary)";
}

function toneLabel(tone: DashboardAlertPlannerTone) {
  if (tone === "ready") return "Ready";
  if (tone === "action") return "Action";
  if (tone === "warn") return "Gate";
  return "Start";
}

export function DashboardAlertPlanner(props: DashboardAlertPlannerInput) {
  const planner = buildDashboardAlertPlanner(props);

  return (
    <Card padding="md" style={{ marginBottom: 16 }} data-testid="dashboard-alert-planner">
      <div className="dashboard-alert-header">
        <div>
          <h2 className="heading-card" style={{ fontWeight: 600, marginBottom: 4 }}>Alert &amp; plan cockpit</h2>
          <div className="caption">Saved scans, chart levels, candidate handoff, plan adherence, and review-only safety.</div>
        </div>
        <a href={planner.primaryAction.href} className="dashboard-alert-primary">
          {planner.primaryAction.tone === "ready" ? "Open" : "Review"}
        </a>
      </div>

      <div className="dashboard-alert-summary" data-testid="dashboard-alert-planner-summary">
        <div>
          <div className="label" style={{ marginBottom: 4, color: toneColor(planner.tone) }}>
            {toneLabel(planner.tone)}
          </div>
          <div style={{ color: "var(--text-primary)", fontSize: 14, fontWeight: 700 }}>
            {planner.headline}
          </div>
          <div className="caption" style={{ marginTop: 4 }}>{planner.summary}</div>
        </div>
      </div>

      <div className="dashboard-alert-grid">
        {planner.items.map((item) => (
          <a key={item.id} href={item.href} className="dashboard-alert-item">
            <div className="dashboard-alert-item-top">
              <span className="label">{item.label}</span>
              <span className="dashboard-alert-pill" style={{ color: toneColor(item.tone) }}>
                {toneLabel(item.tone)}
              </span>
            </div>
            <div className="dashboard-alert-value">{item.value}</div>
            <div className="caption">{item.detail}</div>
          </a>
        ))}
      </div>

      {planner.topSymbols.length > 0 ? (
        <div className="dashboard-alert-symbols" data-testid="dashboard-alert-symbols">
          <div>
            <div className="label" style={{ marginBottom: 4 }}>Triggered symbols</div>
            <div className="caption">Open the latest alert names directly in chart review.</div>
          </div>
          <div className="dashboard-alert-symbol-list">
            {planner.topSymbols.map((symbol) => (
              <a key={symbol.symbol} href={symbol.href} className="dashboard-alert-symbol">
                <span className="mono">{symbol.symbol}</span>
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
