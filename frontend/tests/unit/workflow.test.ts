import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { workflowLifecycleFlags, workflowPlanStatus } from "@/lib/workflow";
import type { WorkflowState } from "@/lib/api";

const validPlan: WorkflowState = {
  symbol: "RELIANCE",
  lifecycle: "watch",
  entry: 2500,
  stop: 2400,
  target: 2750,
  position_size: 5,
  timeframe: "D",
  thesis: "Breakout from a tight base with volume confirmation.",
  invalidation_rule: "Close below the breakout pivot.",
};

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
  return store;
}

describe("workflow plan validation", () => {
  it("blocks order drafting until a plan exists", () => {
    expect(workflowPlanStatus(null)).toEqual({
      valid: false,
      next: "Create a plan before drafting an order.",
    });
  });

  it("requires stop, thesis, and invalidation before Ready unlocks", () => {
    expect(workflowPlanStatus({ ...validPlan, stop: null }).next).toBe("Complete stop.");
    expect(workflowPlanStatus({ ...validPlan, thesis: "" }).next).toBe("Complete thesis.");
    expect(workflowPlanStatus({ ...validPlan, invalidation_rule: " " }).next).toBe("Complete invalidation rule.");
  });

  it("rejects invalid long risk geometry", () => {
    expect(workflowPlanStatus({ ...validPlan, entry: 2400, stop: 2500 }).next).toBe("Entry must be above stop for a long swing plan.");
    expect(workflowPlanStatus({ ...validPlan, target: 2450 }).next).toBe("Target must be above entry.");
  });

  it("marks complete plans ready for order draft", () => {
    expect(workflowPlanStatus(validPlan)).toEqual({
      valid: true,
      next: "Ready for order draft.",
    });
  });

  it("clears review and ignored booleans when lifecycle moves forward", () => {
    expect(workflowLifecycleFlags("ready")).toEqual({ ignored: false, review_later: false });
    expect(workflowLifecycleFlags("watch")).toEqual({ ignored: false, review_later: false });
    expect(workflowLifecycleFlags("review_later")).toEqual({ ignored: false, review_later: true });
    expect(workflowLifecycleFlags("ignored")).toEqual({ ignored: true, review_later: false });
  });
});

describe("workflow local-first persistence", () => {
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

  it("persists single-symbol workflow state locally in mock mode", async () => {
    const { upsertWorkflowState, getWorkflowStates } = await import("@/lib/api");

    await upsertWorkflowState({
      symbol: "reliance",
      lifecycle: "watch",
      source: "scanner",
      entry: 2500,
      tags: ["Breakout"],
    });

    const states = await getWorkflowStates({ symbols: ["RELIANCE"] });
    expect(states).toMatchObject([
      {
        symbol: "RELIANCE",
        lifecycle: "watch",
        source: "scanner",
        entry: 2500,
        tags: ["Breakout"],
      },
    ]);
  });

  it("bulk persists scanner shortlist lifecycle locally", async () => {
    const { bulkUpsertWorkflowStates, getWorkflowStates } = await import("@/lib/api");

    await bulkUpsertWorkflowStates([
      { symbol: "TCS", lifecycle: "idea", source: "scanner" },
      { symbol: "INFY", lifecycle: "review_later", review_later: true, source: "scanner" },
    ]);

    const states = await getWorkflowStates({ symbols: ["TCS", "INFY"] });
    expect(states.map((state) => [state.symbol, state.lifecycle, state.review_later ?? false])).toEqual([
      ["TCS", "idea", false],
      ["INFY", "review_later", true],
    ]);
  });

  it("keeps rich scanner context when later patches only change lifecycle", async () => {
    const { getWorkflowStates, upsertWorkflowState } = await import("@/lib/api");
    const { scannerWatchlistPatch } = await import("@/lib/scanner-workflow");

    await upsertWorkflowState(scannerWatchlistPatch(
      {
        symbol: "AUBANK",
        match_reasons: ["Price above EMA stack"],
        confidence_reasons: ["RS near highs"],
        setup_score: 82,
        setup_grade: "A",
        confidence_label: "High confidence",
      },
      "watchlist-1",
      {
        presetId: "trend_template",
        presetName: "Trend Template",
        tradeDate: "2026-05-15",
        dataSource: "NSE bhavcopy EOD",
        dataMode: "eod",
        dataAsOf: "2026-05-15",
      },
    ));

    await upsertWorkflowState({
      symbol: "AUBANK",
      lifecycle: "ready",
      entry: 700,
      stop: 650,
      target: 820,
    });

    const [state] = await getWorkflowStates({ symbols: ["AUBANK"] });
    expect(state).toMatchObject({
      symbol: "AUBANK",
      lifecycle: "ready",
      watchlist_id: "watchlist-1",
      scanner_context: {
        preset_name: "Trend Template",
        match_reasons: ["Price above EMA stack"],
        setup_score: 82,
        data_as_of: "2026-05-15",
      },
      entry: 700,
      stop: 650,
      target: 820,
    });
  });

  it("does not reuse local workflow state when the live API is unavailable", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "live");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_FALLBACK", "true");
    vi.stubEnv("NEXT_PUBLIC_FORCE_LIVE_DATA", "true");
    const store = installLocalStorage();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ detail: "Workflow state is temporarily unavailable." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )));

    const { getWorkflowStates, upsertWorkflowState } = await import("@/lib/api");

    await expect(upsertWorkflowState({
      symbol: "RELIANCE",
      lifecycle: "watch",
    })).rejects.toThrow("Workflow state is temporarily unavailable.");
    expect(store.get("alphavyuh-workflow-state-v1")).toBeUndefined();
    await expect(getWorkflowStates({ symbols: ["RELIANCE"] })).rejects.toThrow("Workflow state is temporarily unavailable.");
  });
});
