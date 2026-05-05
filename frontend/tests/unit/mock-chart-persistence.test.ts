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

describe("mock chart persistence", () => {
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

  it("persists drawings by symbol and timeframe in mock mode", async () => {
    const { deleteDrawing, getDrawings, saveDrawing, updateDrawing } = await import("@/lib/api");

    const saved = await saveDrawing("reliance", {
      timeframe: "D",
      tool_type: "trendline",
      points: [{ time: "2026-04-01", price: 1200 }, { time: "2026-04-12", price: 1320 }],
      style: { color: "#f4f7fb" },
    });

    expect(await getDrawings("RELIANCE", "D")).toHaveLength(1);
    expect(await getDrawings("RELIANCE", "W")).toHaveLength(0);

    await updateDrawing("RELIANCE", saved.id, {
      timeframe: "D",
      tool_type: "horizontal",
      points: [{ time: "2026-04-12", price: 1320 }, { time: "2026-04-12", price: 1320 }],
      style: { color: "#22c55e" },
    });

    expect((await getDrawings("reliance", "D"))[0]).toMatchObject({
      id: saved.id,
      symbol: "RELIANCE",
      tool_type: "horizontal",
      style: { color: "#22c55e" },
    });

    await deleteDrawing("RELIANCE", saved.id);
    expect(await getDrawings("RELIANCE", "D")).toEqual([]);
  });

  it("persists chart workspace layout in mock mode", async () => {
    const { getChartWorkspace, saveChartWorkspace } = await import("@/lib/api");

    await saveChartWorkspace("tcs", {
      timeframe: "W",
      indicators: [{ type: "ema", params: { period: 20 } }, { type: "rsi" }],
      drawings: [],
    });

    expect(await getChartWorkspace("TCS", "W")).toMatchObject({
      symbol: "TCS",
      timeframe: "W",
      indicators: [{ type: "ema", params: { period: 20 } }, { type: "rsi" }],
    });
  });
});
