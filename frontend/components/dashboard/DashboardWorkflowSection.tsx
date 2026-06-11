"use client";

import { useState, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  defaultOpen?: boolean;
};

export function DashboardWorkflowSection({ children, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section data-testid="dashboard-workflow-section" style={{ marginTop: 8 }}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        data-testid="dashboard-workflow-toggle"
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 14px",
          marginBottom: open ? 12 : 0,
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border-subtle)",
          background: "var(--surface-1)",
          color: "var(--text-secondary)",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <span>Desk workflow</span>
        <span className="caption" style={{ color: "var(--text-tertiary)" }}>{open ? "Hide" : "Show"} session tools</span>
      </button>
      {open ? <div className="dashboard-workflow-stack">{children}</div> : null}
    </section>
  );
}
