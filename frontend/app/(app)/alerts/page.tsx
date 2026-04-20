"use client";

import Link from "next/link";

export default function AlertsPage() {
  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{
        padding: "22px 24px",
        borderRadius: 24,
        border: "1px solid rgba(255,255,255,0.08)",
        background:
          "radial-gradient(circle at top right, rgba(217,163,59,0.14), transparent 28%), linear-gradient(180deg, rgba(13,22,26,0.94), rgba(10,14,18,0.96))",
        boxShadow: "var(--shadow-panel)",
      }}>
        <div className="label" style={{ color: "var(--accent)", marginBottom: 10 }}>Alerts</div>
        <h1 style={{ fontSize: "clamp(28px, 4vw, 42px)", lineHeight: 1.02, letterSpacing: "-0.04em", marginBottom: 8 }}>Manage price alerts from the same trading desk.</h1>
        <p style={{ maxWidth: 720, fontSize: 14, lineHeight: 1.7, color: "var(--text-secondary)" }}>
          Alert creation already lives inside the chart workspace. This screen now acts as a clean launch point until a full alerts center is added.
        </p>
      </div>

      <div style={{
        padding: 24,
        borderRadius: 24,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015)), var(--surface-1)",
        boxShadow: "var(--shadow-panel)",
      }}>
        <div style={{ display: "grid", gap: 16 }}>
          <div>
            <div className="heading-card" style={{ marginBottom: 6 }}>Current alert workflow</div>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text-secondary)" }}>
              Open any symbol chart and use the alert control in the chart toolbar to create or remove active price alerts for that name.
            </p>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/charts/RELIANCE" style={{
              padding: "10px 16px",
              borderRadius: 999,
              background: "linear-gradient(180deg, var(--accent-strong), var(--accent))",
              color: "#061110",
              fontSize: 13,
              fontWeight: 600,
            }}>
              Open chart alerts
            </Link>
            <Link href="/settings" style={{
              padding: "10px 16px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.03)",
              color: "var(--text-primary)",
              fontSize: 13,
              fontWeight: 500,
            }}>
              Open settings
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
