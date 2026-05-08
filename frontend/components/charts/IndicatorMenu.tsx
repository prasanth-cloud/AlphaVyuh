"use client";

import { SlidersHorizontal } from "lucide-react";
import { indicatorKey, indicatorLabel, indicatorMenuItems } from "./indicators";
import type { ChartIndicator } from "./types";

type Props = {
  selected: ChartIndicator[];
  onChange: (next: ChartIndicator[]) => void;
};

export default function IndicatorMenu({ selected, onChange }: Props) {
  const selectedKeys = new Set(selected.map(indicatorKey));
  const selectedLabel = selected.length === 0
    ? "Indicators"
    : selected.length <= 2
      ? selected.map(indicatorLabel).join(" · ")
      : `Indicators · ${selected.length}`;

  function toggle(indicator: ChartIndicator) {
    const key = indicatorKey(indicator);
    onChange(selectedKeys.has(key)
      ? selected.filter((item) => indicatorKey(item) !== key)
      : [...selected, indicator]);
  }

  return (
    <details style={{ position: "relative" }}>
      <summary
        className="workspace-chip-button"
        style={{ listStyle: "none", display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}
      >
        <SlidersHorizontal size={13} />
        {selectedLabel}
      </summary>
      <div
        style={{
          position: "absolute",
          right: 0,
          top: "calc(100% + 6px)",
          zIndex: 40,
          minWidth: 172,
          padding: 6,
          borderRadius: 8,
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-panel)",
        }}
      >
        {indicatorMenuItems.map((indicator) => {
          const key = indicatorKey(indicator);
          const active = selectedKeys.has(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggle(indicator)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "7px 8px",
                border: 0,
                borderRadius: 6,
                background: active ? "rgba(244,247,251,0.08)" : "transparent",
                color: active ? "var(--text-primary)" : "var(--text-secondary)",
                fontSize: 12,
                fontWeight: 650,
                cursor: "pointer",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 13,
                    height: 13,
                    borderRadius: 3,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: active ? "1px solid var(--accent)" : "1px solid var(--border-subtle)",
                    background: active ? "rgba(244,247,251,0.12)" : "transparent",
                  }}
                >
                  {active ? "x" : ""}
                </span>
                {indicatorLabel(indicator)}
              </span>
              <span aria-hidden="true">{active ? "on" : "off"}</span>
            </button>
          );
        })}
      </div>
    </details>
  );
}
