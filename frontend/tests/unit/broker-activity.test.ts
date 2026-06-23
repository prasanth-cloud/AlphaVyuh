import { describe, expect, it } from "vitest";
import { brokerActivityStatus, formatBrokerActivityTime } from "@/lib/broker-activity";
import type { BrokerOrderActivityItem } from "@/lib/api";

function activity(overrides: Partial<BrokerOrderActivityItem> = {}): BrokerOrderActivityItem {
  return {
    id: "order-1",
    broker: "upstox",
    broker_order_id: "broker-order-1",
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
    placed_at: "2026-06-18T14:00:00.000Z",
    reconciled_at: null,
    journal_state: "not_created",
    ...overrides,
  };
}

describe("broker activity presentation", () => {
  it("keeps pending submissions out of filled-position language", () => {
    expect(brokerActivityStatus(activity())).toEqual({
      label: "Awaiting fill",
      tone: "warn",
      detail: "Submitted to the broker; not counted as a position yet.",
    });
  });

  it("shows actual partial-fill progress", () => {
    expect(brokerActivityStatus(activity({
      execution_status: "PARTIAL",
      filled_quantity: 2,
    }))).toMatchObject({
      label: "Partial fill",
      tone: "warn",
      detail: "2/5 filled; check broker for the remainder.",
    });
  });

  it("surfaces broker rejection reasons", () => {
    expect(brokerActivityStatus(activity({
      execution_status: "REJECTED",
      rejection_reason: "Insufficient funds",
      requires_reconciliation: false,
    }))).toMatchObject({
      label: "Rejected",
      tone: "bad",
      detail: "Insufficient funds",
    });
  });

  it("handles unavailable timestamps safely", () => {
    expect(formatBrokerActivityTime("not-a-date")).toBe("Time unavailable");
    expect(formatBrokerActivityTime(null)).toBe("Time unavailable");
  });
});
