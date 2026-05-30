import { describe, expect, it } from "vitest";
import { brokerOrderGatePresentation, brokerReadOnlyChecklist } from "@/lib/broker-safety";

describe("broker order gate presentation", () => {
  it("fails closed when broker status is unavailable", () => {
    expect(brokerOrderGatePresentation(null, { unavailable: true })).toEqual({
      value: "UNAVAILABLE",
      detail: "Broker safety gate cannot be confirmed right now; order capture must stay as journal drafts.",
      status: "bad",
    });
  });

  it("keeps future order routes blocked until read-only smoke passes", () => {
    expect(brokerOrderGatePresentation({
      broker: "zerodha",
      connected: true,
      read_only_smoke_required: true,
      read_only_smoke_passed: false,
      live_order_enabled: false,
    })).toEqual({
      value: "SMOKE REQUIRED",
      detail: "Zerodha read-only smoke must pass before any future sandbox/live order route can be enabled.",
      status: "warn",
    });
  });

  it("still requires owner enablement after read-only smoke passes", () => {
    expect(brokerOrderGatePresentation({
      broker: "upstox",
      connected: true,
      read_only_smoke_required: true,
      read_only_smoke_passed: true,
      live_order_enabled: false,
    })).toEqual({
      value: "SMOKE PASSED",
      detail: "Upstox read-only profile, holdings, orderbook, and import checks passed. Orders still require explicit owner enablement.",
      status: "good",
    });
  });

  it("calls out owner-enabled execution as still gated", () => {
    expect(brokerOrderGatePresentation({
      broker: "zerodha",
      connected: true,
      read_only_smoke_required: true,
      read_only_smoke_passed: true,
      live_order_enabled: true,
    })).toMatchObject({
      value: "OWNER ENABLED",
      status: "warn",
    });
  });

  it("builds a sanitized read-only smoke checklist", () => {
    const checklist = brokerReadOnlyChecklist({
      connected: true,
      read_only_smoke_checks: {
        profile: { ok: true, user_id_present: true },
        holdings: { ok: true, count: 3 },
        orderbook: { ok: false, count: 0, error: "TokenException" },
      },
    });

    expect(checklist.find((item) => item.id === "profile")).toMatchObject({
      value: "Passed",
      tone: "good",
    });
    expect(checklist.find((item) => item.id === "holdings")).toMatchObject({
      value: "Passed · 3 rows",
      tone: "good",
    });
    expect(checklist.find((item) => item.id === "orderbook")).toMatchObject({
      value: "Needs attention · 0 rows",
      tone: "warn",
    });
    expect(checklist.find((item) => item.id === "tradebook")).toMatchObject({
      value: "Pending",
      tone: "pending",
    });
    expect(JSON.stringify(checklist)).not.toContain("access-token");
    expect(JSON.stringify(checklist)).not.toContain("stored-token");
  });
});
