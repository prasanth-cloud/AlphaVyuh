"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  getBrokerOrderActivity,
  reconcileBrokerOrder,
  type BrokerOrderActivityItem,
} from "@/lib/api";
import { brokerActivityStatus, formatBrokerActivityTime } from "@/lib/broker-activity";

const TONE_COLOR = {
  good: "var(--gain)",
  warn: "var(--warn)",
  bad: "var(--loss)",
  muted: "var(--text-tertiary)",
} as const;

export function BrokerActivityTimeline() {
  const [orders, setOrders] = useState<BrokerOrderActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getBrokerOrderActivity();
      setOrders(result.orders);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Broker activity is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function reconcile(order: BrokerOrderActivityItem) {
    if (!order.broker_order_id) return;
    setBusyOrderId(order.id);
    setError("");
    try {
      await reconcileBrokerOrder(order.broker_order_id);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Broker reconciliation failed.");
    } finally {
      setBusyOrderId(null);
    }
  }

  return (
    <section
      data-testid="broker-activity-timeline"
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
            Order lifecycle
          </div>
          <div className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>Broker activity timeline</div>
          <div className="text-[12px]" style={{ color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.55 }}>
            Submitted is not filled. Only broker-reported fills become Journal positions.
          </div>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="workspace-chip-button">
          <RefreshCw size={12} style={{ display: "inline", marginRight: 6 }} />
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <div data-testid="broker-activity-error" style={{ padding: 12, borderRadius: 10, color: "var(--warn)", background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.24)" }}>
          {error} Existing order state has not been changed.
        </div>
      ) : null}

      {!loading && !error && orders.length === 0 ? (
        <div data-testid="broker-activity-empty" className="text-[12px]" style={{ color: "var(--text-secondary)", padding: "8px 0" }}>
          No order intents yet. Chart and watchlist journal captures will appear here.
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 9 }}>
        {orders.map((order) => {
          const state = brokerActivityStatus(order);
          const price = order.average_fill_price ?? order.requested_price;
          return (
            <article key={order.id} data-testid={`broker-activity-${order.id}`} style={{ padding: "11px 12px", borderRadius: 12, border: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span className="mono text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{order.symbol}</span>
                    <span className="workspace-pill" style={{ color: order.side === "BUY" ? "var(--gain)" : "var(--loss)" }}>{order.side}</span>
                    <span className="workspace-pill" style={{ color: TONE_COLOR[state.tone] }}>{state.label}</span>
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.5 }}>
                    {state.detail}
                  </div>
                  <div className="text-[11px] mono" style={{ color: "var(--text-tertiary)", marginTop: 5 }}>
                    {order.broker} · {order.filled_quantity}/{order.quantity} filled
                    {price != null ? ` · ₹${price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : ""}
                    {" · "}{formatBrokerActivityTime(order.reconciled_at ?? order.placed_at)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {order.journal_id ? (
                    <Link href={`/journal?symbol=${encodeURIComponent(order.symbol)}`} className="workspace-chip-button">
                      Open journal
                    </Link>
                  ) : null}
                  {order.requires_reconciliation && order.broker_order_id ? (
                    <button type="button" onClick={() => void reconcile(order)} disabled={busyOrderId === order.id} className="workspace-chip-button">
                      {busyOrderId === order.id ? "Checking…" : "Check broker"}
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
