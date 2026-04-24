"use client";

interface JournalStatusBarProps {
  brokerConnected: boolean;
  brokerName: string | null;
  importing: boolean;
  onImport: () => void;
  onAddTrade: () => void;
}

export function JournalStatusBar({
  brokerConnected,
  brokerName,
  importing,
  onImport,
  onAddTrade,
}: JournalStatusBarProps) {
  return (
    <div style={{ height: 44, background: "var(--surface-1)", borderBottom: "1px solid var(--border-subtle)", padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)" }}>Trading Journal</span>
        {brokerConnected && (
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>↑ {brokerName}</span>
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {brokerConnected && brokerName === "zerodha" && (
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
