"use client";

import { Card } from "@/components/ui";
import {
  buildDashboardScannerEffectiveness,
  type DashboardScannerEffectivenessInput,
  type DashboardScannerTone,
} from "@/lib/dashboard-scanner-effectiveness";
import { formatDashboardPnl } from "@/lib/dashboard-equity";

function toneColor(tone: DashboardScannerTone) {
  if (tone === "ready") return "var(--gain)";
  if (tone === "action") return "var(--accent)";
  if (tone === "warn") return "var(--warn)";
  return "var(--text-tertiary)";
}

function toneLabel(tone: DashboardScannerTone) {
  if (tone === "ready") return "Ready";
  if (tone === "action") return "Action";
  if (tone === "warn") return "Gate";
  return "Start";
}

export function DashboardScannerEffectiveness(props: DashboardScannerEffectivenessInput) {
  const scanner = buildDashboardScannerEffectiveness(props);

  return (
    <Card padding="md" style={{ marginBottom: 16 }} data-testid="dashboard-scanner-effectiveness">
      <div className="dashboard-scanner-header">
        <div>
          <h2 className="heading-card" style={{ fontWeight: 600, marginBottom: 4 }}>Scanner effectiveness</h2>
          <div className="caption">Scanner alerts, idea conversion, live journal sample, best preset, and bottlenecks.</div>
        </div>
        <a href={scanner.primaryAction.href} className="dashboard-scanner-primary">
          {scanner.primaryAction.tone === "ready" ? "Open" : "Review"}
        </a>
      </div>

      <div className="dashboard-scanner-summary" data-testid="dashboard-scanner-effectiveness-summary">
        <div>
          <div className="label" style={{ marginBottom: 4, color: toneColor(scanner.tone) }}>
            {toneLabel(scanner.tone)}
          </div>
          <div style={{ color: "var(--text-primary)", fontSize: 14, fontWeight: 700 }}>
            {scanner.headline}
          </div>
          <div className="caption" style={{ marginTop: 4 }}>{scanner.summary}</div>
        </div>
      </div>

      <div className="dashboard-scanner-grid">
        {scanner.items.map((item) => (
          <a key={item.id} href={item.href} className="dashboard-scanner-item">
            <div className="dashboard-scanner-item-top">
              <span className="label">{item.label}</span>
              <span className="dashboard-scanner-pill" style={{ color: toneColor(item.tone) }}>
                {toneLabel(item.tone)}
              </span>
            </div>
            <div className="dashboard-scanner-value">{item.value}</div>
            <div className="caption">{item.detail}</div>
          </a>
        ))}
      </div>

      {scanner.presets.length > 0 ? (
        <div className="dashboard-scanner-presets" data-testid="dashboard-scanner-presets">
          <div className="dashboard-scanner-presets-header">
            <div>
              <div className="label" style={{ marginBottom: 4 }}>Preset leaderboard</div>
              <div className="caption">Closed scanner-sourced trades sorted by P&amp;L.</div>
            </div>
            <a href="/journal?tab=analytics" className="caption" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 700 }}>
              Analytics
            </a>
          </div>
          <div className="dashboard-scanner-preset-list">
            {scanner.presets.map((preset) => (
              <a key={preset.name} href="/journal?tab=analytics" className="dashboard-scanner-preset-row">
                <span className="dashboard-scanner-preset-name">{preset.name}</span>
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
