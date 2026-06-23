"use client";

import { Card } from "@/components/ui";
import {
  buildDashboardPerformanceCoach,
  type DashboardPerformanceCoachInput,
  type DashboardPerformanceCoachTone,
} from "@/lib/dashboard-performance-coach";

function toneColor(tone: DashboardPerformanceCoachTone) {
  if (tone === "ready") return "var(--gain)";
  if (tone === "action") return "var(--accent)";
  if (tone === "warn") return "var(--warn)";
  return "var(--text-tertiary)";
}

function toneLabel(tone: DashboardPerformanceCoachTone) {
  if (tone === "ready") return "Ready";
  if (tone === "action") return "Action";
  if (tone === "warn") return "Gate";
  return "Start";
}

export function DashboardPerformanceCoach(props: DashboardPerformanceCoachInput) {
  const coach = buildDashboardPerformanceCoach(props);

  return (
    <Card padding="md" style={{ marginBottom: 16 }} data-testid="dashboard-performance-coach">
      <div className="dashboard-coach-header">
        <div>
          <h2 className="heading-card" style={{ fontWeight: 600, marginBottom: 4 }}>Performance coach</h2>
          <div className="caption">AI pattern review, process leaks, best edge, risk discipline, and hold behavior.</div>
        </div>
        <a href={coach.primaryAction.href} className="dashboard-coach-primary">
          {coach.primaryAction.tone === "ready" ? "Open" : "Review"}
        </a>
      </div>

      <div className="dashboard-coach-summary" data-testid="dashboard-performance-coach-summary">
        <div>
          <div className="label" style={{ marginBottom: 4, color: toneColor(coach.tone) }}>
            {toneLabel(coach.tone)}
          </div>
          <div style={{ color: "var(--text-primary)", fontSize: 14, fontWeight: 700 }}>
            {coach.headline}
          </div>
          <div className="caption" style={{ marginTop: 4 }}>{coach.summary}</div>
        </div>
      </div>

      <div className="dashboard-coach-grid">
        {coach.items.map((item) => (
          <a key={item.id} href={item.href} className="dashboard-coach-item">
            <div className="dashboard-coach-item-top">
              <span className="label">{item.label}</span>
              <span className="dashboard-coach-pill" style={{ color: toneColor(item.tone) }}>
                {toneLabel(item.tone)}
              </span>
            </div>
            <div className="dashboard-coach-value">{item.value}</div>
            <div className="caption">{item.detail}</div>
          </a>
        ))}
      </div>

      {coach.insights.length > 0 ? (
        <div className="dashboard-coach-insights" data-testid="dashboard-performance-coach-insights">
          <div className="dashboard-coach-insights-header">
            <div>
              <div className="label" style={{ marginBottom: 4 }}>Coaching notes</div>
              <div className="caption">Top behavior signals from the reviewed trade sample.</div>
            </div>
            <a href="/journal?tab=analytics" className="caption" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 700 }}>
              Analytics
            </a>
          </div>
          <div className="dashboard-coach-insight-list">
            {coach.insights.map((insight) => (
              <a key={`${insight.label}-${insight.value}`} href="/journal?tab=analytics" className="dashboard-coach-insight">
                <span className="dashboard-coach-insight-label" style={{ color: toneColor(insight.tone) }}>
                  {insight.label}
                </span>
                <span className="dashboard-coach-insight-value">{insight.value}</span>
                <span className="caption">{insight.detail}</span>
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
