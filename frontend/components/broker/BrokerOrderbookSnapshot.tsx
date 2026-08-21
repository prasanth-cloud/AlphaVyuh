"use client";

import { useCallback, useState } from "react";
import { RefreshCw } from "lucide-react";
import { getBrokerOrders, type BrokerOrderSnapshot } from "@/lib/api";

type BrokerOrderbookSnapshotProps = {
  broker: "zerodha" | "upstox" | null;
  enabled: boolean;
};

const STATUS_COLOR: Record<BrokerOrderSnapshot["status"], string> = {
  PENDING: "var(--warn)",
  OPEN: "var(--warn)",
  PARTIAL: "var(--warn)",
  COMPLETE: "var(--gain)",
  CANCELLED: "var(--text-tertiary)",
  REJECTED: "var(--loss)",
};

function formatStatus(status: BrokerOrderSnapshot["status"]): string {
  return status.toLowerCase().replaceAll("_", " ");
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

export function BrokerOrderbookSnapshot({ broker, enabled }: BrokerOrderbookSnapshotProps) {
  const [orders, setOrders] = useState<BrokerOrderSnapshot[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!enabled || !broker) {
      setError("Connect a broker before loading the read-only orderbook.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await getBrokerOrders(broker);
      setOrders(result.orders);
      setFetchedAt(result.fetched_at);
      setLoaded(true);
    } catch (reason) {
      setOrders([]);
      setFetchedAt(null);
      setLoaded(false);
      setError(reason instanceof Error ? reason.message : "Broker orderbook is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }, [broker, enabled]);

  return (
    <section
      data-testid="broker-orderbook-snapshot"
      style={{
        marginTop: 14,
        padding: 18,
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border-subtle)",
        background: "var(--surface-1)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div>
          <div className="text-[11px] uppercase tracking-[0.1em]" style={{ color: "var(--text-tertiary)", marginBottom: 4 }}>
            Broker-reported orderbook
          </div>
          <div className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>Read-only equity orders</div>
          <div className="text-[12px]" style={{ color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.55 }}>
            This is the broker account snapshot, separate from AlphaVyuh order intents. It cannot place, modify, cancel, or reconcile an order.
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || !enabled || !broker}
          className="workspace-chip-button"
        >
          <RefreshCw size={12} style={{ display: "inline", marginRight: 6 }} />
          {loading ? "Loading…" : loaded ? "Refresh" : "Load orderbook"}
        </button>
      </div>

      {error ? (
        <div data-testid="broker-orderbook-error" style={{ padding: 12, borderRadius: 10, color: "var(--warn)", background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.24)" }}>
          {error} Existing broker state has not been changed.
        </div>
      ) : null}

      {!error && loaded && fetchedAt ? (
        <div className="text-[11px]" style={{ color: "var(--text-tertiary)", marginBottom: 9 }}>
          Fetched {formatDate(fetchedAt)} · {orders.length} equity order{orders.length === 1 ? "" : "s"}
        </div>
      ) : null}

      {!error && loaded && orders.length === 0 ? (
        <div data-testid="broker-orderbook-empty" className="text-[12px]" style={{ color: "var(--text-secondary)", padding: "8px 0" }}>
          The broker returned no NSE/BSE equity orders in this snapshot.
        </div>
      ) : null}

      {!error && !loaded ? (
        <div className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
          {enabled ? "No broker orderbook loaded yet." : "A connected read-only broker session is required."}
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 8 }}>
        {orders.slice(0, 8).map((order) => (
          <article key={order.broker_order_id} style={{ padding: "10px 11px", borderRadius: 10, border: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span className="mono text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{order.symbol}</span>
                  <span className="workspace-pill" style={{ color: order.side === "BUY" ? "var(--gain)" : "var(--loss)" }}>{order.side}</span>
                  <span className="workspace-pill" style={{ color: STATUS_COLOR[order.status] }}>{formatStatus(order.status)}</span>
                </div>
                <div className="text-[11px] mono" style={{ color: "var(--text-secondary)", marginTop: 6 }}>
                  {order.exchange} · {order.order_type} · {order.product} · {order.filled_quantity}/{order.quantity} filled
                </div>
                <div className="text-[11px] mono" style={{ color: "var(--text-tertiary)", marginTop: 4 }}>
                  {formatDate(order.updated_at)} · {order.broker_order_id}
                </div>
              </div>
              <div className="text-right mono" style={{ flexShrink: 0 }}>
                <div className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  {order.average_price > 0 ? `₹${order.average_price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "—"}
                </div>
                <div className="text-[10px]" style={{ color: "var(--text-tertiary)", marginTop: 3 }}>
                  {order.limit_price != null ? `Limit ₹${order.limit_price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "Market"}
                </div>
              </div>
            </div>
            {order.rejection_reason ? (
              <div className="text-[11px]" style={{ color: "var(--loss)", marginTop: 7 }}>{order.rejection_reason}</div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
