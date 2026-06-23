"use client";

import { Card } from "@/components/ui";
import {
  buildDashboardDataConfidence,
  type DashboardDataConfidenceInput,
  type DashboardDataConfidenceTone,
} from "@/lib/dashboard-data-confidence";

function toneColor(tone: DashboardDataConfidenceTone) {
  if (tone === "ready") return "var(--gain)";
  if (tone === "action") return "var(--accent)";
  if (tone === "warn") return "var(--warn)";
  return "var(--text-tertiary)";
}

function toneLabel(tone: DashboardDataConfidenceTone) {
  if (tone === "ready") return "Ready";
  if (tone === "action") return "Review";
  if (tone === "warn") return "Gate";
  return "Start";
}

export function DashboardDataConfidence(props: DashboardDataConfidenceInput) {
  const confidence = buildDashboardDataConfidence(props);

  return (
    <Card padding="md" style={{ marginBottom: 16 }} data-testid="dashboard-data-confidence">
      <div className="dashboard-confidence-header">
        <div>
          <h2 className="heading-card" style={{ fontWeight: 600, marginBottom: 4 }}>Data confidence</h2>
          <div className="caption">Freshness, coverage, services, alerts, journal sample, and import readiness.</div>
        </div>
        <div className="dashboard-confidence-score" aria-label={`Data confidence score ${confidence.score} of 100`}>
          <span className="mono">{confidence.score}</span>
          <span>/100</span>
        </div>
      </div>

      <div className="dashboard-confidence-summary" data-testid="dashboard-data-confidence-summary">
        <div>
          <div className="label" style={{ marginBottom: 4, color: toneColor(confidence.tone) }}>
            {toneLabel(confidence.tone)}
          </div>
          <div style={{ color: "var(--text-primary)", fontSize: 14, fontWeight: 700 }}>
            {confidence.headline}
          </div>
          <div className="caption" style={{ marginTop: 4 }}>{confidence.summary}</div>
        </div>
        <a href={confidence.primaryAction.href} className="dashboard-confidence-cta">
          {confidence.primaryAction.tone === "ready" ? "Open" : "Review"}
        </a>
      </div>

      <div className="dashboard-confidence-grid">
        {confidence.checks.map((check) => (
          <a key={check.id} href={check.href} className="dashboard-confidence-check">
            <div className="dashboard-confidence-check-top">
              <span className="label">{check.label}</span>
              <span className="dashboard-confidence-pill" style={{ color: toneColor(check.tone) }}>
                {toneLabel(check.tone)}
              </span>
            </div>
            <div className="dashboard-confidence-value">{check.value}</div>
            <div className="caption">{check.detail}</div>
          </a>
        ))}
      </div>
    </Card>
  );
}
