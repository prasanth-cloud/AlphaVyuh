"use client";

import { useState } from "react";
import { X } from "lucide-react";

const FEATURES = [
  { feature: "Scanner results", free: "50", pro: "500" },
  { feature: "Saved screens", free: "5", pro: "Unlimited" },
  { feature: "Watchlists", free: "1", pro: "10" },
  { feature: "Watchlist items", free: "20", pro: "200" },
  { feature: "Scan alerts", free: "2", pro: "20" },
  { feature: "Journal history", free: "3 months", pro: "Unlimited" },
  { feature: "AI review", free: "No", pro: "Yes" },
  { feature: "Backtest", free: "No", pro: "Yes" },
];

export function UpgradePrompt({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);

  if (!open || closing) return null;

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => { setClosing(false); onClose(); }, 150);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        style={{
          background: "#12161D",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
          padding: 24,
          maxWidth: 480,
          width: "90%",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#F1EFE8", margin: 0 }}>
            Upgrade to Pro
          </h2>
          <button
            onClick={handleClose}
            style={{ background: "none", border: "none", color: "#A8A29E", cursor: "pointer", padding: 4 }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", fontSize: 11, color: "#6A6A6A", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", padding: "0 0 8px" }}>Feature</th>
              <th style={{ textAlign: "center", fontSize: 11, color: "#6A6A6A", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", padding: "0 0 8px" }}>Free</th>
              <th style={{ textAlign: "center", fontSize: 11, color: "#00D9A7", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", padding: "0 0 8px" }}>Pro</th>
            </tr>
          </thead>
          <tbody>
            {FEATURES.map((row) => (
              <tr key={row.feature} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                <td style={{ fontSize: 13, color: "#F1EFE8", padding: "8px 0" }}>{row.feature}</td>
                <td style={{ fontSize: 13, color: "#A8A29E", textAlign: "center", padding: "8px 0" }}>{row.free}</td>
                <td style={{ fontSize: 13, color: "#F1EFE8", textAlign: "center", padding: "8px 0", fontWeight: 500 }}>{row.pro}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ textAlign: "center" }}>
          <a
            href="/settings/billing"
            style={{
              display: "inline-block",
              padding: "10px 28px",
              background: "#00D9A7",
              color: "#0A0E13",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Upgrade to Pro
          </a>
          <p style={{ fontSize: 12, color: "#6A6A6A", marginTop: 8, marginBottom: 0 }}>
            Starting at Rs 1,999/month
          </p>
        </div>
      </div>
    </div>
  );
}
