"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { getBrokerAuditEvents, type BrokerAuditEvent } from "@/lib/api";
import {
  brokerAuditEventDetail,
  brokerAuditEventLabel,
  formatBrokerActivityTime,
} from "@/lib/broker-activity";

const OUTCOME_COLOR: Record<string, string> = {
  accepted: "var(--accent)",
  submitted: "var(--accent)",
  reconciled: "var(--gain)",
  recorded: "var(--text-secondary)",
  deduplicated: "var(--warn)",
  failed: "var(--loss)",
  blocked: "var(--warn)",
};

function eventSymbol(event: BrokerAuditEvent): string | null {
  return typeof event.metadata.symbol === "string" ? event.metadata.symbol : null;
}

export function BrokerAuditTimeline() {
  const [events, setEvents] = useState<BrokerAuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getBrokerAuditEvents();
      setEvents(result.events);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Broker audit history is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const handleAuditUpdate = () => void load();
    window.addEventListener("alphavyuh:broker-audit-updated", handleAuditUpdate);
    return () => window.removeEventListener("alphavyuh:broker-audit-updated", handleAuditUpdate);
  }, [load]);

  return (
    <section
      data-testid="broker-audit-timeline"
      style={{
        marginTop: 14,
        padding: 18,
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border-subtle)",
        background: "var(--surface-1)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div>
          <div className="text-[11px] uppercase tracking-[0.1em]" style={{ color: "var(--text-tertiary)", marginBottom: 4 }}>
            Safety history
          </div>
          <div className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>Broker audit trail</div>
          <div className="text-[12px]" style={{ color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.55 }}>
            Append-only lifecycle events for broker checks, submissions, failures, and reconciliation. Credentials and raw broker responses are excluded.
          </div>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="workspace-chip-button">
          <RefreshCw size={12} style={{ display: "inline", marginRight: 6 }} />
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <div data-testid="broker-audit-error" style={{ padding: 12, borderRadius: 10, color: "var(--warn)", background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.24)" }}>
          {error} Existing audit history has not changed.
        </div>
      ) : null}

      {!loading && !error && events.length === 0 ? (
        <div data-testid="broker-audit-empty" className="text-[12px]" style={{ color: "var(--text-secondary)", padding: "8px 0" }}>
          No broker safety events yet. Read-only checks and order lifecycle actions will appear here.
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 9 }}>
        {events.map((event) => {
          const symbol = eventSymbol(event);
          const outcome = event.outcome.toLowerCase();
          return (
            <article key={event.id} data-testid={`broker-audit-${event.id}`} style={{ padding: "11px 12px", borderRadius: 12, border: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{brokerAuditEventLabel(event.event_type)}</span>
                    <span className="workspace-pill" style={{ color: OUTCOME_COLOR[outcome] ?? "var(--text-secondary)" }}>{event.outcome}</span>
                    {event.broker ? <span className="workspace-pill" style={{ color: "var(--text-secondary)" }}>{event.broker}</span> : null}
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.5 }}>
                    {brokerAuditEventDetail(event)}
                  </div>
                  <div className="text-[11px] mono" style={{ color: "var(--text-tertiary)", marginTop: 5 }}>
                    {event.broker_order_id ? `${event.broker_order_id} · ` : ""}{formatBrokerActivityTime(event.created_at)}
                  </div>
                </div>
                {event.journal_id && symbol ? (
                  <Link href={`/journal?symbol=${encodeURIComponent(symbol)}`} className="workspace-chip-button">
                    Open journal
                  </Link>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
