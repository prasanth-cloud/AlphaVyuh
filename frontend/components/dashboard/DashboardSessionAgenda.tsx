"use client";

import { Card } from "@/components/ui";
import {
  buildDashboardSessionAgenda,
  type DashboardAgendaTone,
  type DashboardWorkflowInput,
} from "@/lib/dashboard-session";

function toneColor(tone: DashboardAgendaTone) {
  if (tone === "ready") return "var(--gain)";
  if (tone === "action") return "var(--accent)";
  if (tone === "warn") return "var(--warn)";
  return "var(--text-tertiary)";
}

function toneLabel(tone: DashboardAgendaTone) {
  if (tone === "ready") return "Ready";
  if (tone === "action") return "Action";
  if (tone === "warn") return "Check";
  return "Start";
}

export function DashboardSessionAgenda(props: DashboardWorkflowInput) {
  const agenda = buildDashboardSessionAgenda(props);

  return (
    <Card padding="md" style={{ marginBottom: 16 }} data-testid="dashboard-session-agenda">
      <div className="dashboard-session-header">
        <div>
          <h2 className="heading-card" style={{ fontWeight: 600, marginBottom: 4 }}>Today&apos;s session agenda</h2>
          <div className="caption">One ordered lane from data check to scanner, watchlist, chart, and journal review.</div>
        </div>
        <a href={agenda.primaryItem.href} className="dashboard-session-primary">
          Open first
        </a>
      </div>

      <div className="dashboard-session-focus" data-testid="dashboard-session-focus">
        <div>
          <div style={{ color: "var(--text-primary)", fontSize: 14, fontWeight: 700 }}>{agenda.headline}</div>
          <div className="caption" style={{ marginTop: 4 }}>{agenda.detail}</div>
        </div>
      </div>

      <div className="dashboard-session-list">
        {agenda.items.map((item) => (
          <a key={`${item.id}-${item.label}`} href={item.href} className="dashboard-session-item">
            <span className="dashboard-session-index" style={{ color: toneColor(item.tone), borderColor: toneColor(item.tone) }}>
              {item.label}
            </span>
            <span className="dashboard-session-copy">
              <span className="dashboard-session-title">{item.title}</span>
              <span className="caption">{item.detail}</span>
            </span>
            <span className="dashboard-session-status" style={{ color: toneColor(item.tone) }}>
              {toneLabel(item.tone)}
            </span>
          </a>
        ))}
      </div>
    </Card>
  );
}
