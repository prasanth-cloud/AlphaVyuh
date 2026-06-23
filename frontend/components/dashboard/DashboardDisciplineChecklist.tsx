"use client";

import { Card } from "@/components/ui";
import {
  buildDashboardDisciplineChecklist,
  type DashboardDisciplineChecklistInput,
  type DashboardDisciplineTone,
} from "@/lib/dashboard-discipline-checklist";

function toneColor(tone: DashboardDisciplineTone) {
  if (tone === "ready") return "var(--gain)";
  if (tone === "action") return "var(--accent)";
  if (tone === "warn") return "var(--warn)";
  return "var(--text-tertiary)";
}

function toneLabel(tone: DashboardDisciplineTone) {
  if (tone === "ready") return "Clear";
  if (tone === "action") return "Check";
  if (tone === "warn") return "Gate";
  return "Start";
}

export function DashboardDisciplineChecklist(props: DashboardDisciplineChecklistInput) {
  const checklist = buildDashboardDisciplineChecklist(props);

  return (
    <Card padding="md" style={{ marginBottom: 16 }} data-testid="dashboard-discipline-checklist">
      <div className="dashboard-discipline-header">
        <div>
          <h2 className="heading-card" style={{ fontWeight: 600, marginBottom: 4 }}>Discipline checklist</h2>
          <div className="caption">Pre-trade rules for data trust, focus, risk, review, events, and import hygiene.</div>
        </div>
        <div className="dashboard-discipline-score" aria-label={`Discipline score ${checklist.score} of 100`}>
          <span className="mono">{checklist.score}</span>
          <span>/100</span>
        </div>
      </div>

      <div className="dashboard-discipline-summary" data-testid="dashboard-discipline-summary">
        <div>
          <div className="label" style={{ marginBottom: 4, color: toneColor(checklist.tone) }}>
            {toneLabel(checklist.tone)}
          </div>
          <div style={{ color: "var(--text-primary)", fontSize: 14, fontWeight: 700 }}>
            {checklist.headline}
          </div>
          <div className="caption" style={{ marginTop: 4 }}>{checklist.summary}</div>
        </div>
        <a href={checklist.primaryRule.href} className="dashboard-discipline-primary">
          Review
        </a>
      </div>

      <div className="dashboard-discipline-grid">
        {checklist.rules.map((rule) => (
          <a key={rule.id} href={rule.href} className="dashboard-discipline-rule">
            <div className="dashboard-discipline-rule-top">
              <span className="label">{rule.label}</span>
              <span className="dashboard-discipline-pill" style={{ color: toneColor(rule.tone) }}>
                {toneLabel(rule.tone)}
              </span>
            </div>
            <div className="dashboard-discipline-value">{rule.value}</div>
            <div className="caption">{rule.detail}</div>
          </a>
        ))}
      </div>
    </Card>
  );
}
