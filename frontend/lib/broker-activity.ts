import type { BrokerOrderActivityItem } from "@/lib/api";

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
