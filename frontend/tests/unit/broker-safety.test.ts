import { describe, expect, it } from "vitest";
import { BROKER_EXECUTION_APPROVAL_ITEMS, brokerOrderActionBarPresentation, brokerOrderGatePresentation, brokerReadOnlyChecklist, brokerReadOnlyEvidenceSummary } from "@/lib/broker-safety";

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

  it("calls out stale read-only smoke separately from never-run smoke", () => {
    expect(brokerOrderGatePresentation({
      broker: "zerodha",
      connected: true,
      read_only_smoke_required: true,
      read_only_smoke_passed: false,
      read_only_smoke_fresh: false,
      read_only_smoke_checked_at: "2026-05-29T08:00:00Z",
      live_order_enabled: false,
    })).toEqual({
      value: "SMOKE STALE",
      detail: "Zerodha read-only smoke is older than the 24-hour launch gate; rerun read-only smoke before any future order route can be enabled.",
      status: "warn",
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

  it("documents the owner approval record required before order tests", () => {
    expect(BROKER_EXECUTION_APPROVAL_ITEMS).toEqual([
      "Owner approval timestamp",
      "Broker and account owner",
      "Mode: sandbox or live",
      "Symbol, side, quantity, and order type",
      "Risk plan and confirmation source",
      "Fresh same-broker read-only smoke evidence",
    ]);
  });

  it("builds a blocked read-only evidence pack while checks are incomplete", () => {
    const summary = brokerReadOnlyEvidenceSummary({
      broker: "zerodha",
      connected: true,
      read_only_smoke_required: true,
      read_only_smoke_passed: false,
      read_only_smoke_checked_at: "2026-05-30T08:00:00Z",
      read_only_smoke_fresh: true,
      read_only_smoke_checks: {
        login_url: { ok: true },
        profile: { ok: true, user_id_present: true },
        holdings: { ok: false, error: "TokenException access-token stored-token" },
      },
    });

    expect(summary).toMatchObject({
      status: "blocked",
      headline: "Read-only evidence incomplete",
      passedChecks: 2,
      totalChecks: 6,
      canProceedToOwnerReview: false,
    });
    expect(summary.blockers).toEqual(expect.arrayContaining([
      "Holdings check is not passing",
      "Positions check is not passing",
      "Orderbook check is not passing",
      "Tradebook check is not passing",
    ]));
    expect(JSON.stringify(summary)).not.toContain("access-token");
    expect(JSON.stringify(summary)).not.toContain("stored-token");
  });

  it("allows owner review only when every read-only check passed and is fresh", () => {
    const summary = brokerReadOnlyEvidenceSummary({
      broker: "upstox",
      connected: true,
      read_only_smoke_required: true,
      read_only_smoke_passed: true,
      read_only_smoke_checked_at: "2026-05-30T09:00:00Z",
      read_only_smoke_fresh: true,
      read_only_smoke_checks: {
        login_url: { ok: true },
        profile: { ok: true, user_id_present: true },
        holdings: { ok: true, count: 1 },
        positions: { ok: true, count: 0 },
        orderbook: { ok: true, count: 2 },
        tradebook: { ok: true, count: 2 },
      },
    });

    expect(summary).toMatchObject({
      status: "ready-for-owner-review",
      headline: "Read-only evidence ready for owner review",
      brokerLabel: "Upstox",
      passedChecks: 6,
      totalChecks: 6,
      canProceedToOwnerReview: true,
      blockers: [],
    });
    expect(summary.detail).toContain("evidence, not approval to place orders");
    expect(summary.evidenceItems).toEqual(expect.arrayContaining([
      { label: "Approval status", value: "Evidence only" },
      { label: "Freshness", value: "Fresh" },
    ]));
  });

  it("requires a refreshed smoke before stale evidence can support owner review", () => {
    expect(brokerReadOnlyEvidenceSummary({
      broker: "zerodha",
      connected: true,
      read_only_smoke_required: true,
      read_only_smoke_passed: true,
      read_only_smoke_checked_at: "2026-05-29T08:00:00Z",
      read_only_smoke_fresh: false,
      read_only_smoke_checks: {
        login_url: { ok: true },
        profile: { ok: true },
        holdings: { ok: true },
        positions: { ok: true },
        orderbook: { ok: true },
        tradebook: { ok: true },
      },
    })).toMatchObject({
      status: "refresh-required",
      canProceedToOwnerReview: false,
      blockers: ["Read-only smoke is older than the 24-hour launch gate"],
    });
  });

  it("builds a journal-only action bar when live routing is disabled", () => {
    expect(brokerOrderActionBarPresentation({
      broker: { broker: "zerodha", connected: true },
      canRouteLiveOrder: false,
      side: "buy",
    })).toEqual({
      modeLabel: "Import only",
      detail: "Order capture records a journal draft only. Place any real trade directly with your broker.",
      primaryLabel: "Save buy journal draft",
      savingLabel: "Saving...",
      primaryDisabled: false,
      requiresLiveConfirmation: false,
      status: "good",
    });
  });

  it("fails the action bar closed when broker status is unavailable", () => {
    expect(brokerOrderActionBarPresentation({
      broker: null,
      unavailable: true,
      canRouteLiveOrder: false,
      side: "sell",
    })).toMatchObject({
      modeLabel: "Read-only unavailable",
      detail: "Broker status is unavailable. Save the plan as a journal draft and place any real trade directly with your broker.",
      primaryLabel: "Save sell journal draft",
      primaryDisabled: false,
      status: "bad",
    });
  });

  it("requires explicit confirmation when a future live route is owner enabled", () => {
    expect(brokerOrderActionBarPresentation({
      broker: { broker: "upstox", connected: true, live_order_enabled: true },
      canRouteLiveOrder: true,
      liveConfirmed: false,
      side: "buy",
    })).toMatchObject({
      modeLabel: "OWNER ENABLED",
      primaryLabel: "Confirm broker order",
      primaryDisabled: true,
      requiresLiveConfirmation: true,
      status: "warn",
    });

    expect(brokerOrderActionBarPresentation({
      broker: { broker: "upstox", connected: true, live_order_enabled: true },
      canRouteLiveOrder: true,
      liveConfirmed: true,
      side: "buy",
    })).toMatchObject({
      primaryLabel: "Buy via upstox",
      primaryDisabled: false,
      requiresLiveConfirmation: true,
    });
  });
});
