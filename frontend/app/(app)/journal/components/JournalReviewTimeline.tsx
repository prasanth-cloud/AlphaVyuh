"use client";

import { Check, CircleDashed, Clock3, TriangleAlert } from "lucide-react";
import type { JournalChartSnapshot, JournalEntry } from "@/lib/api";
import {
  buildJournalReviewTimeline,
  type JournalReviewTimelineStage,
  type JournalReviewTimelineStageState,
} from "@/lib/journal-review-timeline";

type Props = {
  entry: JournalEntry;
  snapshot: JournalChartSnapshot | null;
  snapshotLoading: boolean;
  snapshotError: string | null;
};

const STATE_LABELS: Record<JournalReviewTimelineStageState, string> = {
  recorded: "Recorded",
  pending: "Pending",
  missing: "Not recorded",
  unavailable: "Unavailable",
};

function formatTimestamp(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stageIcon(state: JournalReviewTimelineStageState) {
  if (state === "recorded") return Check;
  if (state === "pending") return Clock3;
  if (state === "unavailable") return TriangleAlert;
  return CircleDashed;
}

function visibleStage(
  stage: JournalReviewTimelineStage,
  snapshotLoading: boolean,
  snapshotError: string | null,
): JournalReviewTimelineStage {
  if (stage.id !== "entry-context") return stage;
  if (snapshotLoading) {
    return {
      ...stage,
      state: "pending",
      primary: "Loading immutable entry context…",
      details: [],
    };
  }
  if (snapshotError) {
    return {
      ...stage,
      state: "unavailable",
      primary: snapshotError,
      details: ["The journal record remains usable; no chart state is being inferred."],
    };
  }
  return stage;
}

export function JournalReviewTimeline({ entry, snapshot, snapshotLoading, snapshotError }: Props) {
  const timeline = buildJournalReviewTimeline(entry, snapshot);
  const statusLabel = snapshotLoading
    ? "Loading evidence"
    : timeline.status === "complete"
    ? "Review complete"
    : timeline.status === "in-progress"
      ? "Trade in progress"
      : "Review needs attention";

  return (
    <section className="journal-review-timeline" data-testid="journal-review-timeline" aria-labelledby="journal-review-timeline-title">
      <div className="journal-review-timeline-header">
        <div>
          <div id="journal-review-timeline-title" className="label">Decision review</div>
          <div className="caption" style={{ marginTop: 4 }}>Plan-to-outcome evidence. Missing context stays visible instead of being inferred.</div>
        </div>
        <div className="journal-review-timeline-summary">
          <span>{timeline.completedStages}/{timeline.totalStages} recorded</span>
          <span>{statusLabel}</span>
        </div>
      </div>

      <ol className="journal-review-timeline-list" aria-label="Trade decision evidence stages">
        {timeline.stages.map((sourceStage) => {
          const stage = visibleStage(sourceStage, snapshotLoading, snapshotError);
          const Icon = stageIcon(stage.state);
          const timestamp = formatTimestamp(stage.timestamp);
          const immutableContext = stage.id === "entry-context" && Boolean(entry.snapshot_state_path);
          return (
            <li
              key={stage.id}
              className={`journal-review-timeline-stage is-${stage.state}`}
              data-state={stage.state}
              data-testid={immutableContext ? "journal-immutable-chart-context" : undefined}
            >
              <div className="journal-review-timeline-rail" aria-hidden="true">
                <span className="journal-review-timeline-marker"><Icon size={13} strokeWidth={2} /></span>
              </div>
              <div className="journal-review-timeline-content" aria-live={stage.id === "entry-context" ? "polite" : undefined}>
                <div className="journal-review-timeline-stage-header">
                  <span className="label">{stage.title}</span>
                  <span className="journal-review-timeline-state">{STATE_LABELS[stage.state]}</span>
                </div>
                <div className="journal-review-timeline-primary">{stage.primary}</div>
                {stage.details.length > 0 && (
                  <ul className="journal-review-timeline-details">
                    {stage.details.map((detail) => <li key={detail}>{detail}</li>)}
                  </ul>
                )}
                {timestamp && <time className="journal-review-timeline-time" dateTime={stage.timestamp ?? undefined}>{timestamp}</time>}
                {stage.id === "entry-context" && stage.state === "recorded" && (
                  <div data-testid="journal-chart-image-unavailable" className="journal-review-timeline-note">
                    Immutable chart context. Image preview was not captured in this release; this is structured chart state, not a screenshot.
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
