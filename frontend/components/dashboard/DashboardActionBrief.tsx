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
  const reviewQueue = brief.items.filter((item) => ["scanner", "watchlist", "risk", "journal"].includes(item.id));
  const actionCount = reviewQueue.filter((item) => item.status === "action" || item.status === "warn").length;
  const importPosture = brief.items.find((item) => item.id === "import");

  return (
    <Card padding="md" data-testid="dashboard-action-brief">
      <div className="dashboard-focus-grid">
        <section className="dashboard-review-queue" aria-labelledby="dashboard-review-queue-title">
          <div className="dashboard-focus-header">
            <div>
              <div className="label" style={{ marginBottom: 6 }}>Review queue</div>
              <h2 id="dashboard-review-queue-title" className="heading-card">
                {actionCount > 0 ? `${actionCount} item${actionCount === 1 ? "" : "s"} need attention` : "Queue is clear"}
              </h2>
            </div>
            <a href="/journal" className="dashboard-secondary-link">Open journal</a>
          </div>

          <div className="dashboard-review-list">
            {reviewQueue.map((item) => (
              <a key={item.id} href={item.href} className="dashboard-review-row">
                <span className="dashboard-review-copy">
                  <span className="dashboard-review-label">{item.label}</span>
                  <span className="caption">{item.detail}</span>
                </span>
                <span className="dashboard-review-value">{item.value}</span>
                <span className="dashboard-review-status" style={{ color: statusColor(item.status) }}>
                  {statusLabel(item.status)}
                </span>
              </a>
            ))}
          </div>

          {props.reviewCoveragePartial === true ? (
            <div className="dashboard-evidence-note">
              Journal counts describe the loaded sample. Unseen trades are not assumed reviewed.
            </div>
          ) : null}
        </section>

        <section className="dashboard-continue-workflow" aria-labelledby="dashboard-continue-title">
          <div className="label" style={{ marginBottom: 6 }}>Continue workflow</div>
          <h2 id="dashboard-continue-title" className="heading-card">
            {brief.nextAction.label}: {brief.nextAction.value}
          </h2>
          <div className="caption dashboard-continue-copy">{brief.nextAction.detail}</div>
          <a href={brief.nextAction.href} className="dashboard-primary-link dashboard-continue-primary">
            Continue
          </a>

          {brief.prioritySymbols.length > 0 ? (
            <div className="dashboard-priority-queue" data-testid="dashboard-priority-queue">
              <div className="dashboard-priority-header">
                <div>
                  <div className="label" style={{ marginBottom: 4 }}>Next symbols</div>
                  <div className="caption">Ranked from the loaded watchlist and workflow context.</div>
                </div>
                <a href="/watchlist" className="dashboard-secondary-link">Open queue</a>
              </div>
              <div className="dashboard-priority-list">
                {brief.prioritySymbols.map((item) => (
                  <div key={item.symbol} className="dashboard-priority-row">
                    <a href={item.chartHref} className="dashboard-priority-symbol" aria-label={`Open ${item.symbol} chart`}>
                      <span className="mono">{item.symbol}</span>
                      {item.companyName ? <span className="caption">{item.companyName}</span> : null}
                    </a>
                    <div className="dashboard-priority-reason">
                      <span>{item.reason}</span>
                      <span className="caption">{item.detail}</span>
                    </div>
                    <div className="dashboard-priority-actions">
                      <a href={item.chartHref} className="dashboard-priority-open" aria-label={`Open ${item.symbol} full chart`}>Chart</a>
                      <a href={item.href} className="dashboard-priority-open" aria-label={`Review ${item.symbol} in watchlist`}>Review</a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="dashboard-evidence-note">Run a scan or add watchlist context to create a ranked continuation.</div>
          )}

          {importPosture ? (
            <a href={importPosture.href} className="dashboard-system-posture">
              <span>Read-only import</span>
              <span style={{ color: statusColor(importPosture.status) }}>{importPosture.value}</span>
            </a>
          ) : null}
        </section>
      </div>
    </Card>
  );
}
