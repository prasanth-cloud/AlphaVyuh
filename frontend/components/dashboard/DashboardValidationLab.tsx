"use client";

import { Card } from "@/components/ui";
import {
  buildDashboardValidationLab,
  type DashboardValidationLabInput,
  type DashboardValidationTone,
} from "@/lib/dashboard-validation-lab";
import { formatDashboardPnl } from "@/lib/dashboard-equity";

function toneColor(tone: DashboardValidationTone) {
  if (tone === "ready") return "var(--gain)";
  if (tone === "action") return "var(--accent)";
  if (tone === "warn") return "var(--warn)";
  return "var(--text-tertiary)";
}

function toneLabel(tone: DashboardValidationTone) {
  if (tone === "ready") return "Ready";
  if (tone === "action") return "Action";
  if (tone === "warn") return "Gate";
  return "Start";
}

export function DashboardValidationLab(props: DashboardValidationLabInput) {
  const validation = buildDashboardValidationLab(props);

  return (
    <Card padding="md" style={{ marginBottom: 16 }} data-testid="dashboard-validation-lab">
      <div className="dashboard-validation-header">
        <div>
          <h2 className="heading-card" style={{ fontWeight: 600, marginBottom: 4 }}>Validation lab</h2>
          <div className="caption">Backtest bridge, forward-test alerts, outcome sample, preset edge, and decision gate.</div>
        </div>
        <a href={validation.primaryAction.href} className="dashboard-validation-primary">
          {validation.primaryAction.tone === "ready" ? "Open" : "Review"}
        </a>
      </div>

      <div className="dashboard-validation-summary" data-testid="dashboard-validation-summary">
        <div>
          <div className="label" style={{ marginBottom: 4, color: toneColor(validation.tone) }}>
            {toneLabel(validation.tone)}
          </div>
          <div style={{ color: "var(--text-primary)", fontSize: 14, fontWeight: 700 }}>
            {validation.headline}
          </div>
          <div className="caption" style={{ marginTop: 4 }}>{validation.summary}</div>
        </div>
      </div>

      <div className="dashboard-validation-grid">
        {validation.items.map((item) => (
          <a key={item.id} href={item.href} className="dashboard-validation-item">
            <div className="dashboard-validation-item-top">
              <span className="label">{item.label}</span>
              <span className="dashboard-validation-pill" style={{ color: toneColor(item.tone) }}>
                {toneLabel(item.tone)}
              </span>
            </div>
            <div className="dashboard-validation-value">{item.value}</div>
            <div className="caption">{item.detail}</div>
          </a>
        ))}
      </div>

      {validation.presets.length > 0 ? (
        <div className="dashboard-validation-presets" data-testid="dashboard-validation-presets">
          <div className="dashboard-validation-presets-header">
            <div>
              <div className="label" style={{ marginBottom: 4 }}>Validated presets</div>
              <div className="caption">Forward-tested scanner outcomes ranked by closed-trade P&amp;L.</div>
            </div>
            <a href="/journal?tab=analytics" className="caption" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 700 }}>
              Analytics
            </a>
          </div>
          <div className="dashboard-validation-preset-list">
            {validation.presets.map((preset) => (
              <a key={preset.name} href="/journal?tab=analytics" className="dashboard-validation-preset-row">
                <span className="dashboard-validation-preset-name">{preset.name}</span>
                <span className="caption">{preset.reviewed}/{preset.trades} reviewed</span>
                <span className="mono" style={{ color: toneColor(preset.tone) }}>{preset.winRate.toFixed(0)}%</span>
                <span className="mono" style={{ color: preset.pnl >= 0 ? "var(--gain)" : "var(--loss)" }}>{formatDashboardPnl(preset.pnl)}</span>
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
