"use client";

import useSWR from "swr";
import { getDataHealth } from "@/lib/api";
import type { DataHealth } from "@/lib/api/types";

const REVALIDATE_MS = 5 * 60 * 1000;

function statusColor(health: DataHealth | null | undefined): { dot: string; bg: string; border: string } {
  if (!health) return { dot: "var(--text-tertiary)", bg: "var(--surface-2)", border: "var(--border-subtle)" };
  if (health.status === "healthy") return { dot: "var(--gain)", bg: "rgba(38,166,91,0.08)", border: "rgba(38,166,91,0.18)" };
  return { dot: "var(--warn)", bg: "rgba(217,119,6,0.08)", border: "rgba(217,119,6,0.18)" };
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

type Props = {
  compact?: boolean;
  className?: string;
};

export function DataHealthBadge({ compact = false, className }: Props) {
  const isDemo = process.env.NEXT_PUBLIC_DATA_MODE === "mock";
  const { data } = useSWR<DataHealth | null>(isDemo ? null : "data-health", () => getDataHealth(), {
    refreshInterval: REVALIDATE_MS,
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const health: DataHealth | null | undefined = isDemo ? {
    status: "healthy",
    latest_trade_date: null,
    hours_since_refresh: null,
    symbols_on_latest_date: null,
    universe_active: null,
    mode: "demo",
    message: "Deterministic demo fixtures",
    indicators_missing: { rsi_14: null, ema_200: null },
    last_run: { id: null, errors: null },
  } : data;

  const colors = statusColor(health);
  const date = formatDate(health?.latest_trade_date);
  const label = health?.mode === "demo" ? `Demo · ${date}` : `EOD · NSE Bhavcopy · ${date}`;
  const title = health?.message || (health?.status === "healthy" ? "Data is up to date" : "Data may be stale or incomplete");

  return (
    <span
      className={className}
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        minHeight: compact ? 22 : 26,
        padding: compact ? "3px 8px" : "5px 10px",
        borderRadius: 999,
        border: `1px solid ${colors.border}`,
        background: colors.bg,
        color: "var(--text-secondary)",
        fontSize: compact ? 10 : 11,
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: colors.dot,
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}
