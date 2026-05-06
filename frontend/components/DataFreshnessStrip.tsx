"use client";

import Link from "next/link";
import { DataProvenanceBadge } from "@/components/ui";
import type { DataHealth } from "@/lib/api";

type DataFreshnessStripProps = {
  health: DataHealth | null;
  tradeDate?: string | null;
  compact?: boolean;
};

function healthTone(status?: DataHealth["status"]) {
  if (status === "healthy") return "var(--gain)";
  if (status === "degraded") return "var(--warn)";
  if (status === "stale") return "var(--loss)";
  return "var(--text-tertiary)";
}

export default function DataFreshnessStrip({ health, tradeDate, compact = false }: DataFreshnessStripProps) {
  const status = health?.status;
  const asOf = tradeDate || health?.latest_trade_date || null;
  const badgeKind = health?.mode === "demo"
    ? "demo"
    : health?.mode === "live"
      ? "live-beta"
      : status === "degraded" || status === "stale" || health?.fallback_active
        ? "fallback"
        : "eod";
  const tone = healthTone(status);
  const detail = health?.message
    ?? (asOf ? `Using latest complete market day ${asOf}.` : "Data freshness check is unavailable.");
  const coverage = health?.coverage_pct == null ? null : `${health.coverage_pct.toFixed(1)}% coverage`;
  const symbols = health?.symbols_on_latest_date == null ? null : `${health.symbols_on_latest_date.toLocaleString("en-IN")} symbols`;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: compact ? "8px 10px" : "10px 12px",
        borderRadius: 12,
        border: "1px solid var(--border-subtle)",
        background: "rgba(255,255,255,0.025)",
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
        <span
          aria-hidden="true"
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: tone,
            boxShadow: status === "healthy" ? "0 0 0 3px rgba(45,181,116,0.12)" : undefined,
            flexShrink: 0,
          }}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <DataProvenanceBadge kind={badgeKind} asOf={asOf} compact />
            <span className="label" style={{ color: tone }}>{status ? status.toUpperCase() : "UNKNOWN"}</span>
            {coverage && <span className="caption">{coverage}</span>}
            {symbols && <span className="caption">{symbols}</span>}
            {health?.provider?.source_name && <span className="caption">{health.provider.source_name}</span>}
          </div>
          {!compact && (
            <div className="caption" style={{ marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {detail}
            </div>
          )}
        </div>
      </div>
      <Link href="/data" className="workspace-chip-button" style={{ flexShrink: 0 }}>
        Data status
      </Link>
    </div>
  );
}
