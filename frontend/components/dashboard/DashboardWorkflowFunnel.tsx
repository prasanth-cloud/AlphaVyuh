"use client";

import { Card } from "@/components/ui";
import {
  buildDashboardWorkflowFunnel,
  type DashboardWorkflowFunnelInput,
  type DashboardWorkflowFunnelTone,
} from "@/lib/dashboard-workflow-funnel";

function toneColor(tone: DashboardWorkflowFunnelTone) {
  if (tone === "ready") return "var(--gain)";
  if (tone === "action") return "var(--accent)";
  if (tone === "warn") return "var(--warn)";
  return "var(--text-tertiary)";
}

function toneLabel(tone: DashboardWorkflowFunnelTone) {
  if (tone === "ready") return "Flow";
  if (tone === "action") return "Next";
  if (tone === "warn") return "Gate";
  return "Start";
}

export function DashboardWorkflowFunnel(props: DashboardWorkflowFunnelInput) {
  const funnel = buildDashboardWorkflowFunnel(props);

  return (
    <Card padding="md" style={{ marginBottom: 16 }} data-testid="dashboard-workflow-funnel">
      <div className="dashboard-funnel-header">
        <div>
          <h2 className="heading-card" style={{ fontWeight: 600, marginBottom: 4 }}>Workflow funnel</h2>
          <div className="caption">Discovery to watchlist, chart plan, open risk, closed trade, and reviewed outcome.</div>
        </div>
        <div className="dashboard-funnel-conversion" aria-label={funnel.conversionLabel}>
          {funnel.conversionLabel}
        </div>
      </div>

      <div className="dashboard-funnel-summary" data-testid="dashboard-workflow-funnel-summary">
        <div>
          <div className="label" style={{ marginBottom: 4, color: toneColor(funnel.tone) }}>
            {toneLabel(funnel.tone)}
          </div>
          <div style={{ color: "var(--text-primary)", fontSize: 14, fontWeight: 700 }}>
            {funnel.headline}
          </div>
          <div className="caption" style={{ marginTop: 4 }}>{funnel.summary}</div>
        </div>
        <a href={funnel.primaryStep.href} className="dashboard-funnel-primary">
          Continue
        </a>
      </div>

      <div className="dashboard-funnel-grid">
        {funnel.steps.map((step, index) => (
          <a key={step.id} href={step.href} className="dashboard-funnel-step">
            <div className="dashboard-funnel-step-top">
              <span className="dashboard-funnel-index" style={{ color: toneColor(step.tone), borderColor: toneColor(step.tone) }}>
                {index + 1}
              </span>
              <span className="dashboard-funnel-pill" style={{ color: toneColor(step.tone) }}>
                {toneLabel(step.tone)}
              </span>
            </div>
            <div className="label">{step.label}</div>
            <div className="dashboard-funnel-value">{step.value}</div>
            <div className="caption">{step.detail}</div>
          </a>
        ))}
      </div>
    </Card>
  );
}
