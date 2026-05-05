import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { workflowPlanStatus } from "@/lib/workflow";
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
});
