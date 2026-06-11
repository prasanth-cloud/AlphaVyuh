"use client";

import Link from "next/link";
import { EyebrowLabel } from "@/components/ui";
import {
  getChartWorkflowLinks,
  getChartWorkflowNextStep,
  TRADER_WORKFLOW_STEPS,
} from "@/lib/workflow-placement";

type ChartWorkflowHeaderProps = {
  planTradeHref?: string;
  contextLine?: React.ReactNode;
  trailing?: React.ReactNode;
  compact?: boolean;
};

export function ChartWorkflowHeader({
  planTradeHref,
  contextLine,
  trailing,
  compact = false,
}: ChartWorkflowHeaderProps) {
  const links = getChartWorkflowLinks(planTradeHref ? { planTradeHref } : {});
  const nextStep = getChartWorkflowNextStep();

  return (
    <div
      className="workspace-card"
      data-testid="chart-workflow-header"
      style={{ padding: compact ? "12px 16px" : "14px 18px", marginBottom: compact ? 12 : 16 }}
    >
      <div
        className="workspace-toolbar"
        style={{ minHeight: "auto", padding: 0, border: "none", gap: 14, flexWrap: "wrap" }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <EyebrowLabel>Chart</EyebrowLabel>
          <p
            className="caption"
            style={{ marginTop: 6, maxWidth: 640, lineHeight: 1.55, color: "var(--text-secondary)" }}
          >
            {TRADER_WORKFLOW_STEPS[3].body}
          </p>
          {contextLine}
        </div>
        <div className="workspace-toolbar-group" style={{ alignItems: "center" }}>
          <Link
            href={nextStep.href}
            className="workspace-chip-button active"
            style={{ textDecoration: "none" }}
            data-testid="workflow-desk-next"
          >
            Next: {nextStep.label} →
          </Link>
        </div>
      </div>
      <div className="workspace-pill-row" style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}>
        {links.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            prefetch={false}
            className={`workspace-chip-button${link.active ? " active" : ""}`}
            style={{ textDecoration: "none" }}
          >
            {link.label}
          </Link>
        ))}
        {trailing}
      </div>
    </div>
  );
}
