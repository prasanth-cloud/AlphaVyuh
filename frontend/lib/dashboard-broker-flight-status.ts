import type { BrokerOrderActivityItem } from "@/lib/api";

export type DashboardBrokerFlightSummary = {
  pending: number;
  partial: number;
  rejected: number;
  filled: number;
  journalMissing: number;
  headline: string;
  detail: string;
  tone: "good" | "warn" | "bad" | "muted";
};

export function buildDashboardBrokerFlightSummary(
  orders: BrokerOrderActivityItem[],
  unavailable = false,
): DashboardBrokerFlightSummary {
  if (unavailable) {
    return {
      pending: 0,
      partial: 0,
      rejected: 0,
      filled: 0,
      journalMissing: 0,
      headline: "Broker activity unavailable",
      detail: "Existing orders are not being treated as clear or filled. Open Broker settings to retry.",
      tone: "warn",
    };
  }

  const pending = orders.filter(order => order.requires_reconciliation && order.filled_quantity === 0).length;
  const partial = orders.filter(order => order.execution_status === "PARTIAL" || (order.filled_quantity > 0 && order.filled_quantity < order.quantity)).length;
  const rejected = orders.filter(order => order.execution_status === "REJECTED").length;
  const filled = orders.filter(order => order.execution_status === "COMPLETE").length;
  const journalMissing = orders.filter(order => order.filled_quantity > 0 && !order.journal_id).length;

  if (journalMissing > 0) {
    return {
      pending, partial, rejected, filled, journalMissing,
      headline: `${journalMissing} fill${journalMissing === 1 ? "" : "s"} ${journalMissing === 1 ? "needs" : "need"} Journal reconciliation`,
      detail: "Broker-reported fills exist without a linked Journal position. Reconcile before trusting P&L.",
      tone: "bad",
    };
  }
  if (partial > 0 || pending > 0) {
    return {
      pending, partial, rejected, filled, journalMissing,
      headline: `${partial + pending} broker order${partial + pending === 1 ? "" : "s"} need attention`,
      detail: partial > 0
        ? `${partial} partial fill${partial === 1 ? "" : "s"} and ${pending} unfilled submission${pending === 1 ? "" : "s"} remain open.`
        : `${pending} submitted order${pending === 1 ? "" : "s"} are not positions yet.`,
      tone: "warn",
    };
  }
  if (rejected > 0) {
    return {
      pending, partial, rejected, filled, journalMissing,
      headline: `${rejected} recent rejection${rejected === 1 ? "" : "s"}`,
      detail: "No open position was created. Review the broker reason before creating a new intent.",
      tone: "warn",
    };
  }
  if (orders.length === 0) {
    return {
      pending, partial, rejected, filled, journalMissing,
      headline: "No broker order activity",
      detail: "Journal captures and future owner-approved sandbox orders will appear here.",
      tone: "muted",
    };
  }
  return {
    pending, partial, rejected, filled, journalMissing,
    headline: "Broker lifecycle clear",
    detail: `${filled} filled order${filled === 1 ? "" : "s"} recorded with no pending reconciliation in the loaded activity.`,
    tone: "good",
  };
}
