"use client";

import { Badge } from "@/components/ui";
import type { JournalEntry } from "./types";
import { fmtCcy, fmtDate, getTradeFlowMeta } from "./utils";

interface TradeTableProps {
  entries: JournalEntry[];
  loading: boolean;
  filterStatus: "all" | "open" | "closed";
  onFilterChange: (s: "all" | "open" | "closed") => void;
  symbolFocus: string;
  reviewFocus: "all" | "needs-review" | "reviewed";
  onClearFocus: () => void;
  selectedEntry: JournalEntry | null;
  onSelectEntry: (e: JournalEntry) => void;
  onCloseEntry: (e: JournalEntry) => void;
  onDeleteEntry: (id: string) => void;
  onAddTrade: () => void;
  journalPlan: string | null;
}

export function TradeTable({
  entries,
  loading,
  filterStatus,
  onFilterChange,
  symbolFocus,
  reviewFocus,
  onClearFocus,
  selectedEntry,
  onSelectEntry,
  onCloseEntry,
  onDeleteEntry,
  onAddTrade,
  journalPlan,
}: TradeTableProps) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ display: "flex", borderRadius: "var(--radius-sm)", padding: 2, gap: 2, background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}>
          {(["all", "open", "closed"] as const).map(s => (
            <button key={s} onClick={() => onFilterChange(s)}
              style={{
                padding: "4px 12px", fontSize: 12, borderRadius: "var(--radius-sm)", cursor: "pointer", textTransform: "capitalize",
                background: filterStatus === s ? "var(--accent)" : "transparent",
                color: filterStatus === s ? "var(--text-on-accent)" : "var(--text-tertiary)",
                fontWeight: filterStatus === s ? 600 : 400,
                transition: "all var(--motion-instant) var(--ease-out)",
              }}>
              {s}
            </button>
          ))}
        </div>
        {(symbolFocus || reviewFocus !== "all") && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {symbolFocus && (
              <span className="mono" style={{ fontSize: 11, padding: "5px 10px", borderRadius: 999, background: "var(--accent-subtle)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}>
                {symbolFocus}
              </span>
            )}
            {reviewFocus !== "all" && (
              <span style={{ fontSize: 11, padding: "5px 10px", borderRadius: 999, background: "var(--surface-2)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}>
                {reviewFocus === "needs-review" ? "Needs review" : "Reviewed"}
              </span>
            )}
            <button onClick={onClearFocus} style={{ fontSize: 11, color: "var(--text-tertiary)", cursor: "pointer" }}>
              Clear focus
            </button>
          </div>
        )}
      </div>

      {/* Free plan notice */}
      {journalPlan === "free" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: "var(--radius-md)", marginBottom: 12, fontSize: 12, background: "var(--warn-subtle)", border: "1px solid var(--border-subtle)" }}>
          <span style={{ color: "var(--warn)" }}>Free plan shows last 3 months of trades only.</span>
          <a href="/settings/billing" style={{ fontWeight: 600, color: "var(--accent)", marginLeft: 16 }}>Upgrade to Pro</a>
        </div>
      )}

      {/* Table */}
      <div style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}>
              {["Symbol", "Type", "Entry", "Source", "P&L", "Review", "Status", ""].map(h => (
                <th key={h} className="label" style={{ textAlign: "left", padding: "10px 12px" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j} style={{ padding: "10px 12px" }}>
                      <div style={{ height: 14, borderRadius: "var(--radius-sm)", background: "var(--surface-3)", width: 60 }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: "48px 0", textAlign: "center" }}>
                  <div className="body-secondary">No trades yet.</div>
                  <button onClick={onAddTrade} style={{ marginTop: 8, fontSize: 13, color: "var(--accent)", cursor: "pointer" }}>
                    Log your first trade
                  </button>
                </td>
              </tr>
            ) : (
              entries.map(e => {
                const flow = getTradeFlowMeta(e);
                return (
                <tr key={e.id}
                  onClick={() => onSelectEntry(e)}
                  style={{
                    borderBottom: "1px solid var(--border-subtle)",
                    background: selectedEntry?.id === e.id ? "var(--accent-subtle)" : "transparent",
                    cursor: "pointer",
                    transition: "background var(--motion-instant) var(--ease-out)",
                  }}
                  onMouseEnter={ev => { if (selectedEntry?.id !== e.id) (ev.currentTarget as HTMLElement).style.background = "var(--surface-2)"; }}
                  onMouseLeave={ev => { if (selectedEntry?.id !== e.id) (ev.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <td style={{ padding: "10px 12px" }}>
                    <span className="mono" style={{ fontWeight: 600, color: "var(--text-primary)" }}>{e.symbol}</span>
                    {e.setup_type && <span className="caption" style={{ marginLeft: 6 }}>{e.setup_type}</span>}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <Badge variant={e.trade_type === "long" ? "gain" : "loss"}>
                      {e.trade_type === "long" ? "L" : "S"}
                    </Badge>
                  </td>
                  <td style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>{fmtDate(e.entry_date)}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>{flow.sourceLabel}</span>
                      <span className="caption">{flow.brokerLabel ? `${flow.brokerLabel} • auto` : (flow.autoRecorded ? "Auto-recorded" : "Manual")}</span>
                    </div>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    {e.pnl == null ? (
                      <span className="caption">Open</span>
                    ) : (
                      <span className="mono" style={{ fontSize: 12, fontWeight: 600, padding: "2px 6px", borderRadius: "var(--radius-sm)", color: e.pnl >= 0 ? "var(--gain)" : "var(--loss)", background: e.pnl >= 0 ? "var(--gain-subtle)" : "var(--loss-subtle)" }}>
                        {e.pnl >= 0 ? "+" : ""}{fmtCcy(e.pnl)}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <Badge variant={flow.reviewTone}>
                      {flow.reviewLabel}
                    </Badge>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    {e.status === "open" ? (
                      <Badge variant="accent">Open</Badge>
                    ) : e.pnl != null ? (
                      <Badge variant={e.pnl >= 0 ? "gain" : "loss"}>{e.pnl >= 0 ? "Win" : "Loss"}</Badge>
                    ) : (
                      <Badge variant="neutral">{e.status}</Badge>
                    )}
                  </td>
                  <td style={{ padding: "10px 12px" }} onClick={ev => ev.stopPropagation()}>
                    <div style={{ display: "flex", gap: 8 }}>
                      {e.status === "open" && (
                        <button onClick={() => onCloseEntry(e)} style={{ fontSize: 11, color: "var(--accent)", cursor: "pointer" }}>
                          Close
                        </button>
                      )}
                      <button onClick={() => onDeleteEntry(e.id)} style={{ fontSize: 11, color: "var(--text-tertiary)", cursor: "pointer" }}>×</button>
                    </div>
                  </td>
                </tr>
              )})
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
