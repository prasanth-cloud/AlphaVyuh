"use client";

import { EyebrowLabel, Num } from "@/components/ui";

interface JournalStatusBarProps {
  brokerConnected: boolean;
  brokerName: string | null;
  brokerStatusLabel?: string | null;
  brokerUnavailableMessage?: string | null;
  canImport?: boolean;
  lastSyncedAt?: string | null;
  importing: boolean;
  closedTrades: number;
  reviewedTrades: number;
  reviewReady: boolean;
  onImport: () => void;
  onAddTrade: () => void;
}

export function JournalStatusBar({
  brokerConnected,
  brokerName,
  brokerStatusLabel,
  brokerUnavailableMessage,
  canImport,
  lastSyncedAt,
  importing,
  closedTrades,
  reviewedTrades,
  reviewReady,
  onImport,
  onAddTrade,
}: JournalStatusBarProps) {
  return (
    <div style={{ minHeight: 56, background: "var(--surface-1)", borderBottom: "1px solid var(--border-subtle)", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <EyebrowLabel>Trading journal</EyebrowLabel>
          <div className="caption" style={{ marginTop: 1 }}>Review trades, imports, and lessons in one loop.</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: brokerUnavailableMessage ? "var(--warn)" : brokerConnected ? "var(--gain)" : "var(--text-tertiary)" }} title={brokerUnavailableMessage ?? undefined}>
            {brokerUnavailableMessage ? "Broker status unavailable" : brokerStatusLabel ?? (brokerConnected ? `Broker read-only${brokerName ? ` · ${brokerName}` : ""}` : "Manual logging active")}
          </span>
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            Sync {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : "not run"}
          </span>
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            <Num>{reviewedTrades}</Num>/<Num>{closedTrades}</Num> closed trades reviewed
          </span>
          <span style={{ fontSize: 12, color: reviewReady ? "var(--accent)" : "var(--text-tertiary)" }}>
            {reviewReady ? "Journal review ready" : `Review unlocks at 3 closed trades`}
          </span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {(canImport || (brokerConnected && brokerName === "zerodha")) && (
          <button
            onClick={onImport}
            disabled={importing}
            style={{ padding: "5px 12px", fontSize: 12, fontWeight: 500, borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", opacity: importing ? 0.5 : 1 }}
          >
            {importing ? "Importing…" : "Import from Zerodha"}
          </button>
        )}
        <button
          onClick={onAddTrade}
          style={{ padding: "5px 14px", fontSize: 12, fontWeight: 600, borderRadius: "var(--radius-md)", background: "var(--accent)", color: "var(--text-on-accent)", cursor: "pointer" }}
        >
          + Log trade
        </button>
      </div>
    </div>
  );
}
