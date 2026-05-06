import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function installLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    },
  });
}

describe("mock order flow", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "mock");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_FALLBACK", "true");
    installLocalStorage();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("creates a local journal draft and workflow state for simulated orders", async () => {
    const { getJournalEntries, getWorkflowStates, placeOrder } = await import("@/lib/api");

    const result = await placeOrder({
      symbol: "reliance",
      side: "buy",
      quantity: 10,
      price: 1500,
      order_type: "market",
      stop_loss: 1440,
      target_price: 1650,
      setup_type: "breakout",
      source_page: "watchlist",
      source_context: "Workflow QA queue",
      thesis: "Breakout holding above prior resistance.",
      invalidation_rule: "Close below the base.",
    });

    expect(result).toMatchObject({
      broker: "simulated",
      journal_status: "open",
      risk_reward: 2.5,
      symbol: "RELIANCE",
    });

    const journal = await getJournalEntries({ symbol: "RELIANCE", status: "open" });
    expect(journal.entries[0]).toMatchObject({
      id: result.journal_id,
      symbol: "RELIANCE",
      entry_price: 1500,
      quantity: 10,
      stop_loss: 1440,
      target_price: 1650,
      setup_type: "breakout",
      status: "open",
    });
    expect(journal.entries[0].entry_reason).toContain("Thesis: Breakout holding");
    expect(journal.entries[0].entry_reason).toContain("Invalidation: Close below");

    const workflow = await getWorkflowStates({ symbols: ["RELIANCE"] });
    expect(workflow[0]).toMatchObject({
      lifecycle: "open",
      entry: 1500,
      stop: 1440,
      target: 1650,
      position_size: 10,
      journal_id: result.journal_id,
    });
  });

  it("deduplicates mock broker imports and exposes sync state", async () => {
    const { getBrokerStatus, getJournalEntries, importZerodhaTrades, runZerodhaReadOnlySmoke } = await import("@/lib/api");

    const before = await getBrokerStatus();
    expect(before.can_import).toBe(true);
    expect(before.connected).toBe(false);

    const first = await importZerodhaTrades();
    const second = await importZerodhaTrades();

    expect(first).toMatchObject({ imported: 2, skipped: 0, total_filled_orders: 2 });
    expect(second).toMatchObject({ imported: 0, skipped: 2, total_filled_orders: 2 });

    const journal = await getJournalEntries({ status: "open" });
    const imported = journal.entries.filter((entry) =>
      entry.entry_reason?.includes("alphavyuh-broker-import:zerodha:order:")
    );
    expect(imported).toHaveLength(2);

    const after = await getBrokerStatus();
    expect(after.last_synced_at).toBeTruthy();
    expect(after.status_label).toBe("Mock broker import ready");

    const smoke = await runZerodhaReadOnlySmoke();
    expect(smoke.checks.profile.ok).toBe(true);
    expect(smoke.checks.orderbook.count).toBe(2);
  });
});
