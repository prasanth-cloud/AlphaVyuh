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

  it("keeps live chart workspace changes available when the API save fails", async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.alphavyuh.test");
    vi.stubEnv("NEXT_PUBLIC_FORCE_LIVE_DATA", "true");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "live");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_FALLBACK", "false");
    installLocalStorage();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })));

    const { getChartWorkspace, saveChartWorkspace } = await import("@/lib/api");

    const saved = await saveChartWorkspace("reliance", {
      timeframe: "D",
      indicators: [{ type: "ema", params: { period: 20 } }],
      drawings: [
        {
          id: "rr-1",
          kind: "hline",
          price: 2840,
          color: "#2dd4bf",
          width: 2,
          label: "Entry",
        },
      ],
    });

    expect(saved.drawings).toHaveLength(1);
    await expect(getChartWorkspace("RELIANCE", "D")).resolves.toMatchObject({
      symbol: "RELIANCE",
      timeframe: "D",
      drawings: [{ id: "rr-1", kind: "hline", price: 2840 }],
    });
  });

  it("can reject live chart workspace save failures while keeping the local cache", async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.alphavyuh.test");
    vi.stubEnv("NEXT_PUBLIC_FORCE_LIVE_DATA", "true");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "live");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_FALLBACK", "false");
    installLocalStorage();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ detail: "Chart workspace sync is temporarily unavailable." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )));

    const { getChartWorkspace, saveChartWorkspace } = await import("@/lib/api");

    await expect(saveChartWorkspace("reliance", {
      timeframe: "D",
      indicators: [{ type: "ema", params: { period: 20 } }],
      drawings: [
        {
          id: "rr-1",
          kind: "hline",
          price: 2840,
          color: "#2dd4bf",
          width: 2,
          label: "Entry",
        },
      ],
    }, { throwOnFailure: true })).rejects.toThrow("Chart workspace sync is temporarily unavailable.");

    await expect(getChartWorkspace("RELIANCE", "D")).resolves.toMatchObject({
      symbol: "RELIANCE",
      timeframe: "D",
      indicators: [{ type: "ema", params: { period: 20 } }],
      drawings: [{ id: "rr-1", kind: "hline", price: 2840 }],
    });
  });

  it("surfaces live chart drawing outages instead of returning an empty list", async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.alphavyuh.test");
    vi.stubEnv("NEXT_PUBLIC_FORCE_LIVE_DATA", "true");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "live");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_FALLBACK", "false");
    installLocalStorage();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ detail: "Chart workspace is temporarily unavailable." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )));

    const { getDrawings } = await import("@/lib/api");

    await expect(getDrawings("RELIANCE", "D")).rejects.toThrow("Chart workspace is temporarily unavailable.");
  });

  it("surfaces live chart drawing save failures", async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.alphavyuh.test");
    vi.stubEnv("NEXT_PUBLIC_FORCE_LIVE_DATA", "true");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "live");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_FALLBACK", "false");
    installLocalStorage();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ detail: "Chart drawing persistence is temporarily unavailable." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )));

    const { saveDrawing } = await import("@/lib/api");

    await expect(saveDrawing("RELIANCE", {
      timeframe: "D",
      tool_type: "trendline",
      points: [{ time: "2026-04-01", price: 1200 }, { time: "2026-04-12", price: 1320 }],
      style: { color: "#f4f7fb" },
    })).rejects.toThrow("Chart drawing persistence is temporarily unavailable.");
  });

  it("surfaces live chart drawing update failures", async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.alphavyuh.test");
    vi.stubEnv("NEXT_PUBLIC_FORCE_LIVE_DATA", "true");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "live");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_FALLBACK", "false");
    installLocalStorage();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ detail: "Chart drawing persistence is temporarily unavailable." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )));

    const { updateDrawing } = await import("@/lib/api");

    await expect(updateDrawing("RELIANCE", "drawing-1", {
      timeframe: "D",
      tool_type: "horizontal",
      points: [{ time: "2026-04-12", price: 1320 }, { time: "2026-04-12", price: 1320 }],
      style: { color: "#22c55e" },
    })).rejects.toThrow("Chart drawing persistence is temporarily unavailable.");
  });

  it("surfaces live chart drawing delete failures", async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.alphavyuh.test");
    vi.stubEnv("NEXT_PUBLIC_FORCE_LIVE_DATA", "true");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "live");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_FALLBACK", "false");
    installLocalStorage();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ detail: "Chart drawing persistence is temporarily unavailable." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )));

    const { deleteDrawing } = await import("@/lib/api");

    await expect(deleteDrawing("RELIANCE", "drawing-1")).rejects.toThrow("Chart drawing persistence is temporarily unavailable.");
  });

  it("surfaces live chart workspace outages when no local workspace cache exists", async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.alphavyuh.test");
    vi.stubEnv("NEXT_PUBLIC_FORCE_LIVE_DATA", "true");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "live");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_FALLBACK", "false");
    installLocalStorage();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ detail: "Chart workspace is temporarily unavailable." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )));

    const { getChartWorkspace } = await import("@/lib/api");

    await expect(getChartWorkspace("RELIANCE", "D")).rejects.toThrow("Chart workspace is temporarily unavailable.");
  });

  it("rejects unavailable chart workspace payloads without caching false-empty drawings", async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.alphavyuh.test");
    vi.stubEnv("NEXT_PUBLIC_FORCE_LIVE_DATA", "true");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "live");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_FALLBACK", "false");
    installLocalStorage();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ status: "unavailable", drawings: [], detail: "Chart workspace is temporarily unavailable." }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    const { getChartWorkspace } = await import("@/lib/api");

    await expect(getChartWorkspace("RELIANCE", "D")).rejects.toThrow("Chart workspace is temporarily unavailable.");
  });
});
