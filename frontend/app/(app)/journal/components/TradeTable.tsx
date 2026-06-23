"use client";

import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Badge, EmptyState } from "@/components/ui";
import { getJournalWorkflowLinks } from "@/lib/workflow-placement";
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
  unavailableMessage?: string | null;
  onRetry?: () => void;
}

const JOURNAL_TABLE_HEADERS = [
  { label: "Symbol", className: "" },
  { label: "Side", className: "" },
  { label: "Setup", className: "" },
  { label: "Dates", className: "journal-table-secondary" },
  { label: "Entry / Exit", className: "journal-table-secondary" },
  { label: "P&L / R", className: "journal-table-mobile-hide" },
  { label: "Review", className: "journal-table-mobile-hide" },
  { label: "Source", className: "journal-table-mobile-hide" },
  { label: "", className: "journal-table-mobile-hide" },
];

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
  unavailableMessage,
  onRetry,
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
      <div className="journal-table-shell">
        <table className="journal-table">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}>
              {JOURNAL_TABLE_HEADERS.map((header) => (
                <th key={header.label} className={`label ${header.className}`} style={{ textAlign: "left", padding: "8px 10px", whiteSpace: "nowrap" }}>{header.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  {Array.from({ length: 9 }).map((__, j) => (
                    <td key={j} style={{ padding: "8px 10px" }}>
                      <div style={{ height: 14, borderRadius: "var(--radius-sm)", background: "var(--surface-3)", width: 60 }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : unavailableMessage ? (
              <tr>
                <td colSpan={9} style={{ padding: "48px 24px", textAlign: "center" }}>
                  <div className="body-secondary" style={{ color: "var(--warn)", fontWeight: 600 }}>Journal data unavailable</div>
                  <div className="caption" style={{ marginTop: 6, maxWidth: 520, marginInline: "auto", lineHeight: 1.6 }}>
                    {unavailableMessage} Existing trades are not being treated as empty.
                  </div>
                  {onRetry && (
                    <button onClick={onRetry} style={{ marginTop: 10, fontSize: 13, color: "var(--accent)", cursor: "pointer" }}>
                      Retry journal
                    </button>
                  )}
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <EmptyState
                    icon={BookOpen}
                    title="No trades in this view"
                    description="Trades logged manually, imported from a broker, or uploaded via contract note appear here."
                    action={{ label: "Log first trade", onClick: onAddTrade }}
                    testId="journal-trades-empty"
                  />
                </td>
              </tr>
            ) : (
              entries.map(e => {
                const flow = getTradeFlowMeta(e);
                const rMultiple = e.risk_reward ?? (
                  e.pnl != null && e.stop_loss != null && e.entry_price !== e.stop_loss && e.quantity > 0
                    ? e.pnl / (Math.abs(e.entry_price - e.stop_loss) * e.quantity)
                    : null
                );
                const outcomeClass = e.status === "closed" && e.pnl != null
                  ? e.pnl >= 0
                    ? "journal-row-win"
                    : "journal-row-loss"
                  : e.status === "open"
                    ? "journal-row-open"
                    : "";
                return (
                <tr key={e.id}
                  onClick={() => onSelectEntry(e)}
                  className={outcomeClass}
                  style={{
                    borderBottom: "1px solid var(--border-subtle)",
                    background: selectedEntry?.id === e.id ? "var(--accent-subtle)" : "transparent",
                    cursor: "pointer",
                    transition: "background var(--motion-instant) var(--ease-out)",
                  }}
                  onMouseEnter={ev => { if (selectedEntry?.id !== e.id) (ev.currentTarget as HTMLElement).style.background = "var(--surface-2)"; }}
                  onMouseLeave={ev => { if (selectedEntry?.id !== e.id) (ev.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <td style={{ padding: "8px 10px" }}>
                    <span className="mono" style={{ fontWeight: 600, color: "var(--text-primary)" }}>{e.symbol}</span>
                    {e.company_name && <div className="caption" style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.company_name}</div>}
                    <div className="journal-mobile-trade-card">
                      <div className="journal-mobile-trade-grid">
                        <div>
                          <div className="label">P&L / R</div>
                          {e.pnl == null ? (
                            <div className="caption">Open trade</div>
                          ) : (
                            <>
                              <div className="mono" style={{ fontSize: 12, fontWeight: 700, color: e.pnl >= 0 ? "var(--gain)" : "var(--loss)" }}>
                                {e.pnl >= 0 ? "+" : ""}{fmtCcy(e.pnl)}
                              </div>
                              <div className="caption">
                                {rMultiple != null ? `${rMultiple >= 0 ? "+" : ""}${rMultiple.toFixed(2)}R` : e.pnl_pct != null ? `${e.pnl_pct >= 0 ? "+" : ""}${e.pnl_pct.toFixed(2)}%` : "R pending"}
                              </div>
                            </>
                          )}
                        </div>
                        <div>
                          <div className="label">Review</div>
                          <Badge variant={flow.reviewTone}>{flow.reviewLabel}</Badge>
                        </div>
                        <div>
                          <div className="label">Source</div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{flow.sourceLabel}</div>
                          <div className="caption">{flow.brokerLabel ? `${flow.brokerLabel} · auto` : (flow.autoRecorded ? "Auto-recorded" : "Manual")}</div>
                        </div>
                        <div>
                          <div className="label">Action</div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} onClick={ev => ev.stopPropagation()}>
                            {e.status === "open" && (
                              <button onClick={() => onCloseEntry(e)} className="workspace-chip-button">
                                Close
                              </button>
                            )}
                            <button onClick={() => onSelectEntry(e)} className="workspace-chip-button active">
                              Review
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <Badge variant={e.trade_type === "long" ? "gain" : "loss"}>
                      {e.trade_type === "long" ? "L" : "S"}
                    </Badge>
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{e.setup_type || "—"}</span>
                  </td>
                  <td className="journal-table-secondary" style={{ padding: "8px 10px", color: "var(--text-secondary)" }}>
                    <div>{fmtDate(e.entry_date)}</div>
                    <div className="caption">{e.exit_date ? fmtDate(e.exit_date) : "Open"}</div>
                  </td>
                  <td className="journal-table-secondary" style={{ padding: "8px 10px" }}>
                    <div className="mono" style={{ fontSize: 12, color: "var(--text-primary)" }}>₹{e.entry_price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</div>
                    <div className="caption">{e.exit_price != null ? `₹${e.exit_price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "No exit"}</div>
                  </td>
                  <td className="journal-table-mobile-hide" style={{ padding: "8px 10px" }}>
                    {e.pnl == null ? (
                      <span className="caption">Open</span>
                    ) : (
                      <div style={{ display: "grid", gap: 3 }}>
                        <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: e.pnl >= 0 ? "var(--gain)" : "var(--loss)" }}>
                          {e.pnl >= 0 ? "+" : ""}{fmtCcy(e.pnl)}
                        </span>
                        <span className="caption">
                          {rMultiple != null ? `${rMultiple >= 0 ? "+" : ""}${rMultiple.toFixed(2)}R` : e.pnl_pct != null ? `${e.pnl_pct >= 0 ? "+" : ""}${e.pnl_pct.toFixed(2)}%` : "R pending"}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="journal-table-mobile-hide" style={{ padding: "8px 10px" }}>
                    <Badge variant={flow.reviewTone}>
                      {flow.reviewLabel}
                    </Badge>
                    {flow.reviewLabel === "Needs review" && (
                      <div className="caption" style={{ marginTop: 3, color: "var(--warn)" }}>Primary action</div>
                    )}
                  </td>
                  <td className="journal-table-mobile-hide" style={{ padding: "8px 10px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>{flow.sourceLabel}</span>
                      <span className="caption">{flow.brokerLabel ? `${flow.brokerLabel} • auto` : (flow.autoRecorded ? "Auto-recorded" : "Manual")}</span>
                    </div>
                  </td>
                  <td className="journal-table-mobile-hide" style={{ padding: "8px 10px" }} onClick={ev => ev.stopPropagation()}>
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

      {symbolFocus && (
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }} data-testid="journal-table-workflow-links">
          {getJournalWorkflowLinks(symbolFocus).map((link) => (
            <Link key={link.label} href={link.href} className="workspace-chip-button" style={{ textDecoration: "none" }}>
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
