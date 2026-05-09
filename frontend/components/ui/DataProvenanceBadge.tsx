"use client";

type ProvenanceKind = "eod" | "live-beta" | "fallback" | "demo" | "broker-beta";

const PROVENANCE_COPY: Record<ProvenanceKind, { label: string; detail: string; color: string; background: string }> = {
  eod: {
    label: "Data ready",
    detail: "Latest complete market session",
    color: "#f4f7fb",
    background: "rgba(91, 99, 245, 0.10)",
  },
  "live-beta": {
    label: "Data updating",
    detail: "Freshness is shown here; verify levels before trading",
    color: "#26a65b",
    background: "rgba(38, 166, 91, 0.12)",
  },
  fallback: {
    label: "Check data",
    detail: "Showing the latest usable market session; some data may be incomplete",
    color: "#d97706",
    background: "rgba(217, 119, 6, 0.12)",
  },
  demo: {
    label: "Demo data",
    detail: "Illustrative workflow preview, not live market data",
    color: "#d6dce5",
    background: "rgba(124, 106, 240, 0.12)",
  },
  "broker-beta": {
    label: "Import only",
    detail: "Broker connection is read-only for beta; live and sandbox order placement are disabled",
    color: "#d97706",
    background: "rgba(217, 119, 6, 0.12)",
  },
};

type DataProvenanceBadgeProps = {
  kind: ProvenanceKind;
  asOf?: string | null;
  compact?: boolean;
  className?: string;
};

export function DataProvenanceBadge({ kind, asOf, compact = false, className }: DataProvenanceBadgeProps) {
  const copy = PROVENANCE_COPY[kind];
  const title = asOf ? `${copy.detail}. As of ${asOf}.` : copy.detail;

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
        border: `1px solid ${copy.color}33`,
        background: copy.background,
        color: copy.color,
        fontSize: compact ? 10 : 11,
        fontWeight: 700,
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
          background: copy.color,
          flexShrink: 0,
        }}
      />
      {copy.label}
      {asOf && !compact && (
        <span style={{ color: "var(--text-tertiary)", fontWeight: 600 }}>
          {asOf}
        </span>
      )}
    </span>
  );
}
