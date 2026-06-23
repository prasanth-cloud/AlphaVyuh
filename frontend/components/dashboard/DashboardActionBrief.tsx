"use client";

import { Card } from "@/components/ui";
import {
  buildDashboardActionBrief,
  type DashboardActionBriefInput,
  type DashboardBriefStatus,
} from "@/lib/dashboard-action-brief";

function statusLabel(status: DashboardBriefStatus) {
  if (status === "ready") return "Ready";
  if (status === "action") return "Action";
  if (status === "warn") return "Check";
  return "Start";
}

function statusColor(status: DashboardBriefStatus) {
  if (status === "ready") return "var(--gain)";
  if (status === "action") return "var(--accent)";
  if (status === "warn") return "var(--warn)";
  return "var(--text-tertiary)";
}

export function DashboardActionBrief(props: DashboardActionBriefInput) {
  const brief = buildDashboardActionBrief(props);

  return (
    <Card padding="md" style={{ marginBottom: 16 }} data-testid="dashboard-action-brief">
      <div className="dashboard-brief-header">
        <div>
          <h2 className="heading-card" style={{ fontWeight: 600, marginBottom: 4 }}>Trading desk brief</h2>
          <div className="caption">Market, scan, watchlist, journal, and import checks before the next decision.</div>
        </div>
        <div className="dashboard-brief-score" aria-label={brief.headline}>
          {brief.headline}
        </div>
      </div>

      <div className="dashboard-brief-instruments" data-testid="dashboard-cockpit-instruments">
        {brief.instruments.map((instrument) => (
          <a key={instrument.id} href={instrument.href} className="dashboard-brief-instrument">
            <span className="dashboard-brief-instrument-top">
              <span className="label">{instrument.label}</span>
              <span className="dashboard-brief-status" style={{ color: statusColor(instrument.status) }}>
                {statusLabel(instrument.status)}
              </span>
            </span>
            <span className="dashboard-brief-instrument-value">{instrument.value}</span>
            <span className="caption">{instrument.detail}</span>
          </a>
        ))}
      </div>

      <div className="dashboard-brief-next" data-testid="dashboard-next-action">
        <div>
          <div className="label" style={{ marginBottom: 4 }}>Next best action</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
            {brief.nextAction.label}: {brief.nextAction.value}
          </div>
          <div className="caption" style={{ marginTop: 4 }}>{brief.nextAction.detail}</div>
        </div>
        <a href={brief.nextAction.href} className="dashboard-brief-cta">
          Open
        </a>
      </div>

      <div className="dashboard-brief-grid">
        {brief.items.map((item) => (
          <a key={item.id} href={item.href} className="dashboard-brief-item">
            <div className="dashboard-brief-item-top">
              <span className="label">{item.label}</span>
              <span className="dashboard-brief-status" style={{ color: statusColor(item.status) }}>
                {statusLabel(item.status)}
              </span>
            </div>
            <div className="dashboard-brief-value">{item.value}</div>
            <div className="caption" style={{ lineHeight: 1.45 }}>{item.detail}</div>
          </a>
        ))}
      </div>

      {brief.prioritySymbols.length > 0 ? (
        <div className="dashboard-priority-queue" data-testid="dashboard-priority-queue">
          <div className="dashboard-priority-header">
            <div>
              <div className="label" style={{ marginBottom: 4 }}>Priority symbols</div>
              <div className="caption">Ranked from watchlist context, scanner quality, market signal, and journal review debt.</div>
            </div>
            <a href="/watchlist" className="caption" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 700 }}>
              Open queue
            </a>
          </div>
          <div className="dashboard-priority-list">
            {brief.prioritySymbols.map((item) => (
              <div key={item.symbol} className="dashboard-priority-row">
                <a href={item.chartHref} className="dashboard-priority-symbol" aria-label={`Open ${item.symbol} chart`}>
                  <span className="mono">{item.symbol}</span>
                  {item.companyName ? <span className="caption">{item.companyName}</span> : null}
                </a>
                <div className="dashboard-priority-meta">
                  <span className="dashboard-priority-label">{item.label}</span>
                  <span className="caption">{item.watchlistName}</span>
                </div>
                <div className="dashboard-priority-reason">
                  <span>{item.reason}</span>
                  <span className="caption">{item.detail}</span>
                </div>
                <div className="dashboard-priority-actions">
                  <a href={item.chartHref} className="dashboard-priority-open" aria-label={`Open ${item.symbol} full chart`}>
                    Chart
                  </a>
                  <a href={item.href} className="dashboard-priority-open" aria-label={`Review ${item.symbol} in watchlist`}>
                    Review
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
