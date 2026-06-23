"use client";

import { Card } from "@/components/ui";
import {
  buildDashboardChartWorkbench,
  type DashboardChartWorkbenchInput,
  type DashboardChartWorkbenchTone,
} from "@/lib/dashboard-chart-workbench";

function toneColor(tone: DashboardChartWorkbenchTone) {
  if (tone === "ready") return "var(--gain)";
  if (tone === "action") return "var(--accent)";
  if (tone === "warn") return "var(--warn)";
  return "var(--text-tertiary)";
}

function toneLabel(tone: DashboardChartWorkbenchTone) {
  if (tone === "ready") return "Ready";
  if (tone === "action") return "Action";
  if (tone === "warn") return "Gate";
  return "Start";
}

export function DashboardChartWorkbench(props: DashboardChartWorkbenchInput) {
  const workbench = buildDashboardChartWorkbench(props);

  return (
    <Card padding="md" style={{ marginBottom: 16 }} data-testid="dashboard-chart-workbench">
      <div className="dashboard-chart-header">
        <div>
          <h2 className="heading-card" style={{ fontWeight: 600, marginBottom: 4 }}>Chart workbench</h2>
          <div className="caption">Next chart, multi-chart board, price levels, context, and plan handoff.</div>
        </div>
        <a href={workbench.primaryAction.href} className="dashboard-chart-primary">
          {workbench.primaryAction.tone === "ready" ? "Open" : "Review"}
        </a>
      </div>

      <div className="dashboard-chart-summary" data-testid="dashboard-chart-workbench-summary">
        <div>
          <div className="label" style={{ marginBottom: 4, color: toneColor(workbench.tone) }}>
            {toneLabel(workbench.tone)}
          </div>
          <div style={{ color: "var(--text-primary)", fontSize: 14, fontWeight: 700 }}>
            {workbench.headline}
          </div>
          <div className="caption" style={{ marginTop: 4 }}>{workbench.summary}</div>
        </div>
      </div>

      <div className="dashboard-chart-grid">
        {workbench.items.map((item) => (
          <a key={item.id} href={item.href} className="dashboard-chart-item">
            <div className="dashboard-chart-item-top">
              <span className="label">{item.label}</span>
              <span className="dashboard-chart-pill" style={{ color: toneColor(item.tone) }}>
                {toneLabel(item.tone)}
              </span>
            </div>
            <div className="dashboard-chart-value">{item.value}</div>
            <div className="caption">{item.detail}</div>
          </a>
        ))}
      </div>

      {workbench.symbols.length > 0 ? (
        <div className="dashboard-chart-symbols" data-testid="dashboard-chart-workbench-symbols">
          <div>
            <div className="label" style={{ marginBottom: 4 }}>Chart queue</div>
            <div className="caption">Open candidates directly in full chart review.</div>
          </div>
          <div className="dashboard-chart-symbol-list">
            {workbench.symbols.map((symbol) => (
              <a key={symbol.symbol} href={symbol.href} className="dashboard-chart-symbol">
                <span className="mono">{symbol.symbol}</span>
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
