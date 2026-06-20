"use client";

import { useEffect, useState } from "react";
import { getMe, updateMe, getWatchlists } from "@/lib/api";

type StepState = { done: boolean; label: string };

const CHECK = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
    <circle cx="7" cy="7" r="7" fill="var(--gain)" />
    <path d="M4 7.2L6.2 9.4L10 5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CIRCLE = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
    <circle cx="7" cy="7" r="6" stroke="var(--text-tertiary)" strokeWidth="1.2" strokeDasharray="3 2" />
  </svg>
);

export function FirstRunBanner() {
  const [visible, setVisible] = useState(false);
  const [steps, setSteps] = useState<StepState[]>([
    { done: false, label: "Run a scan to explore the market" },
    { done: false, label: "Save a symbol to your watchlist" },
    { done: false, label: "Open a chart to dig deeper" },
  ]);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const profile = await getMe();
        if (cancelled) return;
        if (profile.onboarding_dismissed) return;

        const hasScan = !!profile.first_scan_at;

        let hasWatchlistItem = false;
        try {
          const watchlists = await getWatchlists();
          if (!cancelled) {
            hasWatchlistItem = (watchlists ?? []).some(
              (w: { items?: unknown[] }) => (w.items?.length ?? 0) > 0
            );
          }
        } catch { /* watchlists may not be loaded yet */ }

        const hasChart = typeof window !== "undefined" && localStorage.getItem("alphavyuh-chart-visited") === "1";

        if (cancelled) return;

        if (hasScan && hasWatchlistItem && hasChart) return;

        setSteps([
          { done: hasScan, label: "Run a scan to explore the market" },
          { done: hasWatchlistItem, label: "Save a symbol to your watchlist" },
          { done: hasChart, label: "Open a chart to dig deeper" },
        ]);
        setVisible(true);
      } catch { /* silent — banner is non-critical */ }
    }

    check();
    return () => { cancelled = true; };
  }, []);

  async function dismiss() {
    setDismissing(true);
    try {
      await updateMe({ onboarding_dismissed: true });
    } catch { /* best-effort */ }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "10px 14px",
        borderRadius: "var(--radius-lg, 8px)",
        border: "1px solid var(--border-default)",
        background: "var(--surface-1)",
        marginBottom: 12,
      }}
    >
      <span
        style={{
          color: "var(--text-secondary)",
          fontSize: 13,
          fontWeight: 600,
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        Getting started
      </span>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {steps.map((step) => (
          <span
            key={step.label}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 999,
              border: `1px solid ${step.done ? "var(--gain)" : "var(--border-subtle, var(--border-default))"}`,
              background: step.done ? "rgba(38,166,91,0.06)" : "var(--surface-2)",
              color: step.done ? "var(--gain)" : "var(--text-secondary)",
              fontSize: 11,
              fontWeight: 600,
              whiteSpace: "nowrap",
              lineHeight: 1,
            }}
          >
            {step.done ? CHECK : CIRCLE}
            {step.label}
          </span>
        ))}
      </div>

      <button
        type="button"
        onClick={dismiss}
        disabled={dismissing}
        aria-label="Dismiss getting started guide"
        style={{
          marginLeft: "auto",
          flexShrink: 0,
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--text-tertiary)",
          fontSize: 16,
          lineHeight: 1,
          padding: 4,
        }}
      >
        ✕
      </button>
    </div>
  );
}
