import { describe, expect, it } from "vitest";
import { buildDashboardBrokerFlightSummary } from "@/lib/dashboard-broker-flight-status";
import type { BrokerOrderActivityItem } from "@/lib/api";

function order(overrides: Partial<BrokerOrderActivityItem> = {}): BrokerOrderActivityItem {
  return {
    id: "order-1",
    broker: "zerodha",
    broker_order_id: "kite-1",
    journal_id: null,
    symbol: "RELIANCE",
    side: "BUY",
    quantity: 5,
    order_type: "LIMIT",
    requested_price: 2500,
    execution_status: "PENDING",
    filled_quantity: 0,
    average_fill_price: null,
    requires_reconciliation: true,
    rejection_reason: null,
    placed_at: "2026-06-18T14:00:00Z",
    reconciled_at: null,
    journal_state: "not_created",
    ...overrides,
  };
}

describe("dashboard broker flight status", () => {
  it("prioritizes fills missing Journal linkage", () => {
    const summary = buildDashboardBrokerFlightSummary([
      order({ execution_status: "PARTIAL", filled_quantity: 2 }),
    ]);
    expect(summary).toMatchObject({
      journalMissing: 1,
      tone: "bad",
      headline: "1 fill needs Journal reconciliation",
    });
  });

  it("counts pending and partial orders as cockpit attention", () => {
    const summary = buildDashboardBrokerFlightSummary([
      order(),
      order({ id: "order-2", execution_status: "PARTIAL", filled_quantity: 2, journal_id: "journal-2" }),
    ]);
    expect(summary).toMatchObject({
      pending: 1,
      partial: 1,
      tone: "warn",
      headline: "2 broker orders need attention",
    });
  });

  it("does not turn an activity outage into a clear state", () => {
    expect(buildDashboardBrokerFlightSummary([], true)).toMatchObject({
      headline: "Broker activity unavailable",
      tone: "warn",
    });
  });
});
