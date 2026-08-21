import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMock = vi.hoisted(() => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: "broker-import-test-token" } } })),
    },
  })),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: supabaseMock.createClient,
}));

describe("broker import API boundary", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "live");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_FALLBACK", "false");
    vi.stubEnv("NEXT_PUBLIC_FORCE_LIVE_DATA", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("preserves unmatched-fill reconciliation state from the broker boundary", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      imported: 2,
      skipped: 1,
      unmatched_fills: 2,
      unmatched_symbols: ["RELIANCE", "INFY"],
      reconciliation_status: "needs_review",
      persisted_unmatched_fills: 2,
      reconciliation_persistence: "available",
      total_filled_orders: 5,
      message: "Import needs review.",
      last_synced_at: "2026-08-21T12:00:00Z",
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const { importBrokerTrades } = await import("@/lib/api");
    await expect(importBrokerTrades("upstox")).resolves.toMatchObject({
      imported: 2,
      skipped: 1,
      unmatched_fills: 2,
      unmatched_symbols: ["RELIANCE", "INFY"],
      reconciliation_status: "needs_review",
      total_filled_orders: 5,
    });
  });

  it("rejects malformed broker import counts instead of treating them as success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      imported: "2",
      skipped: 0,
      unmatched_fills: 0,
      reconciliation_status: "complete",
      total_filled_orders: 2,
      message: "Import complete.",
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const { importBrokerTrades } = await import("@/lib/api");
    await expect(importBrokerTrades()).rejects.toThrow("Broker import returned an invalid imported count.");
  });

  it("accepts the legacy response shape while deriving a complete reconciliation status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      imported: 0,
      message: "No new trades to import",
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const { importBrokerTrades } = await import("@/lib/api");
    await expect(importBrokerTrades()).resolves.toMatchObject({
      imported: 0,
      skipped: 0,
      unmatched_fills: 0,
      unmatched_symbols: [],
      reconciliation_status: "complete",
      total_filled_orders: 0,
    });
  });

  it("loads durable broker reconciliation records with bounded fields", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      reconciliations: [{
        id: "reconciliation-1",
        broker: "zerodha",
        broker_order_id: "kite-order-1",
        symbol: "reliance",
        side: "SELL",
        filled_quantity: 10,
        average_price: 2525,
        executed_at: "2026-08-21T08:50:00Z",
        status: "needs_review",
        setup_id: null,
        journal_id: null,
        resolution_note: null,
        last_seen_at: "2026-08-21T09:00:00Z",
        created_at: "2026-08-21T09:00:00Z",
        updated_at: "2026-08-21T09:00:00Z",
      }],
      count: 1,
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const { getBrokerFillReconciliations } = await import("@/lib/api");
    await expect(getBrokerFillReconciliations()).resolves.toMatchObject({
      count: 1,
      reconciliations: [{ symbol: "RELIANCE", filled_quantity: 10, status: "needs_review" }],
    });
  });

  it("rejects malformed durable reconciliation records", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      reconciliations: [{
        id: "reconciliation-1",
        broker: "zerodha",
        broker_order_id: "kite-order-1",
        symbol: "RELIANCE",
        side: "SELL",
        filled_quantity: 0,
        average_price: 2525,
        status: "needs_review",
      }],
      count: 1,
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const { getBrokerFillReconciliations } = await import("@/lib/api");
    await expect(getBrokerFillReconciliations()).rejects.toThrow("Broker reconciliation returned an invalid record.");
  });
});
