"use client";

import { Card } from "@/components/ui";
import {
  buildDashboardRiskControl,
  type DashboardRiskControlInput,
  type DashboardRiskTone,
} from "@/lib/dashboard-risk-control";

function toneColor(tone: DashboardRiskTone) {
  if (tone === "ready") return "var(--gain)";
  if (tone === "action") return "var(--accent)";
  if (tone === "warn") return "var(--warn)";
  return "var(--text-tertiary)";
}

function statusLabel(tone: DashboardRiskTone) {
  if (tone === "ready") return "Stable";
  if (tone === "action") return "Review";
  if (tone === "warn") return "Gate";
  return "Start";
}

export function DashboardRiskControl(props: DashboardRiskControlInput) {
  const risk = buildDashboardRiskControl(props);

  return (
    <Card padding="md" style={{ marginBottom: 16 }} data-testid="dashboard-risk-control">
      <div className="dashboard-risk-header">
        <div>
          <h2 className="heading-card" style={{ fontWeight: 600, marginBottom: 4 }}>Risk &amp; process control</h2>
          <div className="caption">Realised edge, drawdown, review coverage, and open-risk gates.</div>
        </div>
        <div className="dashboard-risk-score" aria-label={`Risk control score ${risk.score} of 100`}>
          <span className="mono">{risk.score}</span>
          <span>/100</span>
        </div>
      </div>

      <div className="dashboard-risk-summary" data-testid="dashboard-risk-summary">
        <div>
          <div className="label" style={{ marginBottom: 4, color: toneColor(risk.status) }}>
            {statusLabel(risk.status)}
          </div>
          <div style={{ color: "var(--text-primary)", fontSize: 14, fontWeight: 700 }}>
            {risk.headline}
          </div>
          <div className="caption" style={{ marginTop: 4 }}>{risk.summary}</div>
        </div>
        <a href={risk.primaryAction.href} className="dashboard-risk-cta">
          {risk.primaryAction.id === "ready" ? "Open analytics" : "Review"}
        </a>
      </div>

      <div className="dashboard-risk-grid">
        {risk.metrics.map((metric) => (
          <div key={metric.label} className="dashboard-risk-metric">
            <div className="dashboard-risk-metric-top">
              <span className="label">{metric.label}</span>
              <span className="dashboard-risk-pill" style={{ color: toneColor(metric.tone) }}>
                {statusLabel(metric.tone)}
              </span>
            </div>
            <div className="dashboard-risk-value">{metric.value}</div>
            <div className="caption">{metric.detail}</div>
          </div>
        ))}
      </div>

      <div className="dashboard-risk-guardrails">
        {risk.guardrails.map((guardrail) => (
          <a key={guardrail.id} href={guardrail.href} className="dashboard-risk-guardrail">
            <span className="dashboard-risk-guardrail-label" style={{ color: toneColor(guardrail.tone) }}>
              {guardrail.label}
            </span>
            <span className="caption">{guardrail.detail}</span>
          </a>
        ))}
      </div>
    </Card>
  );
}
