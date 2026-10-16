"use client";

import { Card, EmptyState } from "@/components/ui";
import { CalendarDays } from "lucide-react";
import type { JournalWeeklyReviewResponse } from "./types";
import type { JournalRuleBreakCode } from "@/lib/api";
import { journalRuleBreakLabel } from "@/lib/journal-weekly-review";

type Props = {
  data: JournalWeeklyReviewResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  evidenceLoading: boolean;
  onDrillThrough: (request: { weekStart: string; entryIds: string[]; label: string; ruleBreak?: JournalRuleBreakCode }) => void;
};

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });
}

export function JournalWeeklyReview({ data, loading, error, onRetry, evidenceLoading, onDrillThrough }: Props) {
  if (loading) {
    return (
      <Card padding="lg" data-testid="journal-weekly-loading">
        <div className="caption">Loading completed-week review evidence…</div>
      </Card>
    );
  }
  if (error) {
    return (
      <Card padding="lg" data-testid="journal-weekly-unavailable">
        <div className="label" style={{ color: "var(--warn)", marginBottom: 8 }}>Weekly review unavailable</div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)" }}>{error} No zero-adherence result is being inferred.</div>
        <button type="button" className="workspace-chip-button" style={{ marginTop: 10 }} onClick={onRetry}>Retry weekly review</button>
      </Card>
    );
  }
  if (!data || data.weeks.length === 0) {
    return (
      <Card padding="lg">
        <EmptyState
          icon={CalendarDays}
          title="No completed week to review yet"
          description="Complete a Monday–Sunday week with at least one closed trade. The current incomplete week is excluded."
          testId="journal-weekly-empty"
        />
      </Card>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }} data-testid="journal-weekly-review">
      <Card padding="lg">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 className="heading-card" style={{ marginBottom: 4 }}>Weekly process evidence</h2>
            <div className="caption">Completed Monday–Sunday weeks, grouped by exit date in Asia/Kolkata. Counts describe self-reported adherence; they do not predict performance.</div>
          </div>
          <div className="caption" style={{ textAlign: "right" }}>
            {formatDate(data.period_start)}–{formatDate(data.period_end)}<br />
            Generated {new Date(data.generated_at).toLocaleString("en-IN")}
          </div>
        </div>
        {!data.coverage_complete && (
          <div style={{ marginTop: 10, color: "var(--warn)", fontSize: 12 }}>Some malformed supporting evidence was omitted. Visible counts should be treated as partial.</div>
        )}
      </Card>

      <div className="journal-weekly-grid">
        {data.weeks.map((week) => {
          const allIds = week.supporting_entries.map((entry) => entry.entry_id);
          const weekEvidenceCapped = allIds.length > 500;
          const weekLabel = `${formatDate(week.week_start)}–${formatDate(week.week_end)}`;
          return (
            <Card key={week.week_start} padding="lg" data-testid="journal-weekly-card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div>
                  <div className="label">Completed week</div>
                  <div style={{ marginTop: 3, fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{weekLabel}</div>
                  <div className="caption" style={{ marginTop: 4 }}>{week.reviewed_trades} reviewed of {week.closed_trades} closed · {week.unreviewed_trades} unreviewed</div>
                </div>
                <button type="button" disabled={evidenceLoading || weekEvidenceCapped} className="workspace-chip-button" onClick={() => onDrillThrough({ weekStart: week.week_start, entryIds: allIds, label: `Week ${weekLabel}` })}>{weekEvidenceCapped ? "Evidence exceeds 500 trades" : evidenceLoading ? "Verifying…" : "View week trades"}</button>
              </div>
              {weekEvidenceCapped && <div className="caption" style={{ marginTop: 7, color: "var(--warn)" }}>Server-verified drill-through is capped at 500 entries. This week has {allIds.length}; no partial ledger will be shown.</div>}

              <div className="journal-weekly-metrics">
                {[
                  ["Followed", `${week.adherence.followed} / ${week.adherence.denominator} applicable reviews`],
                  ["Partly", String(week.adherence.partial)],
                  ["Broke plan", String(week.adherence.not_followed)],
                  ["Not applicable", String(week.adherence.not_applicable)],
                ].map(([label, value]) => (
                  <div key={label} style={{ minWidth: 0, padding: "9px 10px", borderRadius: "var(--radius-sm)", background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
                    <div className="caption">{label}</div>
                    <div style={{ marginTop: 3, fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflowWrap: "anywhere" }}>{value}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 14 }}>
                <div className="label" style={{ marginBottom: 7 }}>Rule-break evidence</div>
                {week.rule_breaks.length ? (
                  <div style={{ display: "grid", gap: 6 }}>
                    {week.rule_breaks.map((rule) => (
                      <div key={rule.code} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{journalRuleBreakLabel(rule.code)} · {rule.count}</span>
                        <button type="button" disabled={evidenceLoading || rule.entry_ids.length > 500} className="workspace-chip-button" onClick={() => onDrillThrough({ weekStart: week.week_start, entryIds: rule.entry_ids, label: `${weekLabel} · ${journalRuleBreakLabel(rule.code)}`, ruleBreak: rule.code })}>{rule.entry_ids.length > 500 ? "Evidence exceeds 500 entries" : "View evidence"}</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="caption">No rule breaks were recorded in the reviewed sample.</div>
                )}
              </div>

              <div style={{ marginTop: 14 }}>
                <div className="label" style={{ marginBottom: 7 }}>Supporting entries</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {week.supporting_entries.slice(0, 3).map((entry) => (
                    <button
                      key={entry.entry_id}
                      type="button"
                      disabled={evidenceLoading}
                      onClick={() => onDrillThrough({ weekStart: week.week_start, entryIds: [entry.entry_id], label: `${entry.symbol} · ${entry.exit_date}` })}
                      style={{ minWidth: 0, textAlign: "left", padding: "8px 10px", borderRadius: "var(--radius-sm)", background: "rgba(244,247,251,0.03)", border: "1px solid var(--border-subtle)" }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{entry.symbol}</span>
                        <span className="caption">{entry.review_status === "reviewed" ? entry.setup_adherence?.replaceAll("_", " ") : "Unreviewed"}</span>
                      </div>
                      <div className="caption" style={{ marginTop: 3, overflowWrap: "anywhere" }}>{entry.planned_setup ?? "Planned setup not recorded"}{entry.lesson ? ` · ${entry.lesson}` : ""}</div>
                    </button>
                  ))}
                </div>
                {week.supporting_entries.length > 3 && (
                  <div className="caption" style={{ marginTop: 6 }}>Showing 3 of {week.supporting_entries.length} supporting entries. Use “View week trades” for the complete server-verified set.</div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
