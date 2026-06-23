"use client";

import { Card } from "@/components/ui";
import {
  buildDashboardImportReconciliation,
  type DashboardImportReconciliationInput,
  type DashboardImportReconciliationTone,
} from "@/lib/dashboard-import-reconciliation";

function toneColor(tone: DashboardImportReconciliationTone) {
  if (tone === "ready") return "var(--gain)";
  if (tone === "action") return "var(--accent)";
  if (tone === "warn") return "var(--warn)";
  return "var(--text-tertiary)";
}

function toneLabel(tone: DashboardImportReconciliationTone) {
  if (tone === "ready") return "Ready";
  if (tone === "action") return "Action";
  if (tone === "warn") return "Gate";
  return "Start";
}

export function DashboardImportReconciliation(props: DashboardImportReconciliationInput) {
  const reconciliation = buildDashboardImportReconciliation(props);
  const sourceRows = [
    { label: "Imported", value: reconciliation.sourceMix.imported, tone: "ready" as const },
    { label: "Planned", value: reconciliation.sourceMix.planned, tone: "ready" as const },
    { label: "Manual", value: reconciliation.sourceMix.manual, tone: "action" as const },
    { label: "Unknown", value: reconciliation.sourceMix.unknown, tone: reconciliation.sourceMix.unknown > 0 ? "action" as const : "empty" as const },
  ];

  return (
    <Card padding="md" style={{ marginBottom: 16 }} data-testid="dashboard-import-reconciliation">
      <div className="dashboard-import-header">
        <div>
          <h2 className="heading-card" style={{ fontWeight: 600, marginBottom: 4 }}>Import &amp; reconciliation</h2>
          <div className="caption">Broker sync, source hygiene, import coverage, and review readiness for trade history.</div>
        </div>
        <a href={reconciliation.primaryAction.href} className="dashboard-import-primary">
          {reconciliation.primaryAction.tone === "ready" ? "Open" : "Review"}
        </a>
      </div>

      <div className="dashboard-import-summary" data-testid="dashboard-import-reconciliation-summary">
        <div>
          <div className="label" style={{ marginBottom: 4, color: toneColor(reconciliation.tone) }}>
            {toneLabel(reconciliation.tone)}
          </div>
          <div style={{ color: "var(--text-primary)", fontSize: 14, fontWeight: 700 }}>
            {reconciliation.headline}
          </div>
          <div className="caption" style={{ marginTop: 4 }}>{reconciliation.summary}</div>
        </div>
      </div>

      <div className="dashboard-import-grid">
        {reconciliation.items.map((item) => (
          <a key={item.id} href={item.href} className="dashboard-import-item">
            <div className="dashboard-import-item-top">
              <span className="label">{item.label}</span>
              <span className="dashboard-import-pill" style={{ color: toneColor(item.tone) }}>
                {toneLabel(item.tone)}
              </span>
            </div>
            <div className="dashboard-import-value">{item.value}</div>
            <div className="caption">{item.detail}</div>
          </a>
        ))}
      </div>

      <div className="dashboard-import-source-mix" data-testid="dashboard-import-source-mix">
        <div>
          <div className="label" style={{ marginBottom: 4 }}>Source mix</div>
          <div className="caption">Loaded journal sample by provenance.</div>
        </div>
        <div className="dashboard-import-source-list">
          {sourceRows.map((row) => (
            <a key={row.label} href="/journal" className="dashboard-import-source-pill">
              <span>{row.label}</span>
              <span className="mono" style={{ color: toneColor(row.tone) }}>{row.value}</span>
            </a>
          ))}
        </div>
      </div>
    </Card>
  );
}
