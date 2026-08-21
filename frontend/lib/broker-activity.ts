import type { BrokerAuditEvent, BrokerOrderActivityItem } from "@/lib/api";

export type BrokerActivityTone = "good" | "warn" | "bad" | "muted";

export function brokerActivityStatus(item: BrokerOrderActivityItem): {
  label: string;
  tone: BrokerActivityTone;
  detail: string;
} {
  const status = item.execution_status.toUpperCase();
  if (item.broker === "simulated" || status === "SIMULATED") {
    return { label: "Journal capture", tone: "muted", detail: "Simulation only; no broker order was sent." };
  }
  if (status === "COMPLETE") {
    return { label: "Filled", tone: "good", detail: `${item.filled_quantity}/${item.quantity} filled and reconciled.` };
  }
  if (status === "PARTIAL" || item.filled_quantity > 0) {
    return { label: "Partial fill", tone: "warn", detail: `${item.filled_quantity}/${item.quantity} filled; check broker for the remainder.` };
  }
  if (status === "REJECTED") {
    return { label: "Rejected", tone: "bad", detail: item.rejection_reason || "The broker rejected this order." };
  }
  if (status === "CANCELLED") {
    return { label: "Cancelled", tone: "muted", detail: "Cancelled before any additional fill." };
  }
  return { label: "Awaiting fill", tone: "warn", detail: "Submitted to the broker; not counted as a position yet." };
}

export function formatBrokerActivityTime(value: string | null): string {
  if (!value) return "Time unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Time unavailable" : date.toLocaleString();
}

const AUDIT_EVENT_LABELS: Record<string, string> = {
  "broker.order.intent.accepted": "Order review accepted",
  "broker.order.submitted": "Order submitted",
  "broker.order.journal_capture": "Journal capture recorded",
  "broker.order.deduplicated": "Duplicate order prevented",
  "broker.order.submission_failed": "Order submission failed",
  "broker.order.reconciliation_requested": "Broker check requested",
  "broker.order.reconciliation_failed": "Broker check failed",
  "broker.order.reconciled": "Broker state reconciled",
  "broker.read_only_smoke.completed": "Read-only broker check completed",
};

export function brokerAuditEventLabel(eventType: string): string {
  const known = AUDIT_EVENT_LABELS[eventType];
  if (known) return known;
  return eventType
    .replace(/^broker\./, "")
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function brokerAuditEventDetail(event: BrokerAuditEvent): string {
  const metadata = event.metadata;
  const parts: string[] = [];
  const symbol = typeof metadata.symbol === "string" ? metadata.symbol : null;
  const status = typeof metadata.execution_status === "string" ? metadata.execution_status : null;
  const reason = typeof metadata.reason === "string"
    ? metadata.reason
    : typeof metadata.error_kind === "string" ? metadata.error_kind : null;
  const quantity = typeof metadata.quantity === "number" ? metadata.quantity : null;
  const filledQuantity = typeof metadata.filled_quantity === "number" ? metadata.filled_quantity : null;

  if (symbol) parts.push(symbol.toUpperCase());
  if (status) parts.push(status);
  if (quantity != null && filledQuantity != null) parts.push(`${filledQuantity}/${quantity} filled`);
  if (reason) parts.push(reason.replaceAll("_", " "));
  if (parts.length === 0 && event.outcome) parts.push(event.outcome);
  return parts.join(" · ") || "Recorded safety event.";
}
