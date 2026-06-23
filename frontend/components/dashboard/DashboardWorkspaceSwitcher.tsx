"use client";

import {
  DASHBOARD_WORKSPACE_VIEWS,
  type DashboardWorkspaceView,
} from "@/lib/dashboard-workspace-view";

type DashboardWorkspaceSwitcherProps = {
  value: DashboardWorkspaceView;
  onChange: (value: DashboardWorkspaceView) => void;
};

export function DashboardWorkspaceSwitcher({ value, onChange }: DashboardWorkspaceSwitcherProps) {
  const activeView = DASHBOARD_WORKSPACE_VIEWS.find((view) => view.id === value) ?? DASHBOARD_WORKSPACE_VIEWS[0];

  return (
    <div className="dashboard-workspace-switcher" data-testid="dashboard-workspace-switcher">
      <div className="dashboard-workspace-switcher-copy">
        <div className="label">Dashboard view</div>
        <div className="dashboard-workspace-switcher-title">{activeView.label}</div>
        <div className="caption">{activeView.detail}. Saved on this device.</div>
      </div>
      <div
        className="dashboard-workspace-switcher-options"
        role="tablist"
        aria-label="Dashboard view"
      >
        {DASHBOARD_WORKSPACE_VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            role="tab"
            aria-selected={view.id === value}
            className={`dashboard-workspace-option${view.id === value ? " active" : ""}`}
            onClick={() => onChange(view.id)}
          >
            <span>{view.label}</span>
            <small>{view.detail}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
