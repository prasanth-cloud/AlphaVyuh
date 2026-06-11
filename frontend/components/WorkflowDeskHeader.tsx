"use client";

import Link from "next/link";
import { EyebrowLabel } from "@/components/ui";
import {
  getWorkflowDeskMeta,
  WORKFLOW_FLOW_CAPTION,
  type WorkflowDeskRoute,
} from "@/lib/workflow-placement";

type WorkflowDeskHeaderProps = {
  pathname: WorkflowDeskRoute | "/charts";
  actions?: React.ReactNode;
  compact?: boolean;
  showFlowCaption?: boolean;
};

export function WorkflowDeskHeader({
  pathname,
  actions,
  compact = false,
  showFlowCaption = !compact,
}: WorkflowDeskHeaderProps) {
  const meta = getWorkflowDeskMeta(pathname);
  if (!meta) return null;

  return (
    <div
      className="workspace-desk-header"
      data-testid="workflow-desk-header"
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 16,
        flexWrap: "wrap",
        marginBottom: compact ? 8 : 12,
      }}
    >
      <div style={{ minWidth: 0 }}>
        {!compact && <EyebrowLabel>{meta.eyebrow}</EyebrowLabel>}
        <h1
          className="app-page-title"
          style={{ marginTop: compact ? 0 : 4, marginBottom: 0 }}
        >
          {meta.title}
        </h1>
        {!compact && (
          <p
            className="caption"
            style={{ marginTop: 6, maxWidth: 640, lineHeight: 1.55 }}
          >
            {meta.subtitle}
          </p>
        )}
        {showFlowCaption && !compact && (
          <p className="caption" style={{ marginTop: 4, color: "var(--text-tertiary)" }}>
            {WORKFLOW_FLOW_CAPTION}
          </p>
        )}
      </div>
      <div className="workspace-toolbar-group" style={{ alignItems: "center" }}>
        {meta.nextStep && (
          <Link
            href={meta.nextStep.href}
            className="workspace-chip-button active"
            style={{ textDecoration: "none" }}
            data-testid="workflow-desk-next"
          >
            Next: {meta.nextStep.label} →
          </Link>
        )}
        {actions}
      </div>
    </div>
  );
}
