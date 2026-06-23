"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { X, Check } from "lucide-react";
import { authHeaders } from "@/lib/api/client";
import { API_BASE_URL } from "@/lib/api-base";

type StepKey = "scan" | "watchlist" | "chart";

const STEPS: { key: StepKey; label: string; href: string }[] = [
  { key: "scan", label: "Run a scan", href: "/scanner" },
  { key: "watchlist", label: "Add to watchlist", href: "/watchlist" },
  { key: "chart", label: "Open a chart", href: "/scanner" },
];

export function FirstRunBanner() {
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<StepKey>>(new Set());
  const isDemo = process.env.NEXT_PUBLIC_DATA_MODE === "mock";

  useEffect(() => {
    if (isDemo) {
      setDismissed(false);
      return;
    }
    (async () => {
      try {
        const headers = await authHeaders();
        const res = await fetch(`${API_BASE_URL}/api/v1/me`, { headers });
        if (!res.ok) return;
        const user = await res.json();
        if (user.onboarding_dismissed) {
          setDismissed(true);
          return;
        }
        setDismissed(false);

        const completed = new Set<StepKey>();
        try {
          const wlRes = await fetch(`${API_BASE_URL}/api/v1/watchlists`, { headers });
          if (wlRes.ok) {
            const wls = await wlRes.json();
            if (Array.isArray(wls) && wls.some((w: { items?: unknown[] }) => w.items && w.items.length > 0)) {
              completed.add("watchlist");
            }
          }
        } catch { /* ignore */ }
        setCompletedSteps(completed);
      } catch { /* ignore */ }
    })();
  }, [isDemo]);

  if (dismissed === null || dismissed) return null;

  const handleDismiss = async () => {
    setDismissed(true);
    if (isDemo) return;
    try {
      const headers = await authHeaders();
      await fetch(`${API_BASE_URL}/api/v1/me`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ onboarding_dismissed: true }),
      });
    } catch { /* best-effort */ }
  };

  return (
    <div
      style={{
        background: "#12161D",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 8,
        padding: "16px 20px",
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "#A8A29E" }}>Get started:</span>
        {STEPS.map((step) => {
          const done = completedSteps.has(step.key);
          return (
            <Link
              key={step.key}
              href={step.href}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 14px",
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 500,
                background: done ? "rgba(0,217,167,0.12)" : "rgba(255,255,255,0.04)",
                color: done ? "#00D9A7" : "#F1EFE8",
                textDecoration: "none",
                border: done ? "1px solid rgba(0,217,167,0.3)" : "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {done && <Check size={12} />}
              {step.label}
            </Link>
          );
        })}
      </div>
      <button
        onClick={handleDismiss}
        style={{
          background: "none",
          border: "none",
          color: "#A8A29E",
          cursor: "pointer",
          padding: 4,
          flexShrink: 0,
        }}
        aria-label="Dismiss onboarding"
      >
        <X size={16} />
      </button>
    </div>
  );
}
