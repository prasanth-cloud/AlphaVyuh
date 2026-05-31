import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("price alerts API", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses mock alerts in mock mode without hitting the backend", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "mock");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_FALLBACK", "true");
    vi.stubGlobal("fetch", vi.fn(() => {
      throw new Error("mock mode should not call backend");
    }));

    const { getPriceAlerts } = await import("@/lib/api");

    const alerts = await getPriceAlerts();
    expect(alerts.length).toBeGreaterThan(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("creates and persists mock price alerts without hitting the backend", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "mock");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_FALLBACK", "true");
    vi.stubGlobal("fetch", vi.fn(() => {
      throw new Error("mock mode should not call backend");
    }));
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });

    const { createPriceAlert, getPriceAlerts } = await import("@/lib/api");

    const created = await createPriceAlert({
      symbol: "aubank",
      condition: "above",
      target_price: 724.126,
      note: "Horizontal line alert from saved drawing",
    });

    expect(created).toMatchObject({
      symbol: "AUBANK",
      condition: "above",
      target_price: 724.13,
      note: "Horizontal line alert from saved drawing",
      is_active: true,
    });
    await expect(getPriceAlerts()).resolves.toEqual(expect.arrayContaining([created]));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("deletes mock price alerts without hitting the backend", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "mock");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_FALLBACK", "true");
    vi.stubGlobal("fetch", vi.fn(() => {
      throw new Error("mock mode should not call backend");
    }));
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });

    const { createPriceAlert, deletePriceAlert, getPriceAlerts } = await import("@/lib/api");

    const created = await createPriceAlert({
      symbol: "RELIANCE",
      condition: "below",
      target_price: 1310,
      note: "Support lost",
    });
    await deletePriceAlert(created.id);

    const alerts = await getPriceAlerts();
    expect(alerts.some((alert) => alert.id === created.id)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps an empty live alert list as a valid empty state", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.alphavyuh.test");
    vi.stubEnv("NEXT_PUBLIC_FORCE_LIVE_DATA", "true");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "live");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_FALLBACK", "false");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ alerts: [] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    const { getPriceAlerts } = await import("@/lib/api");

    await expect(getPriceAlerts()).resolves.toEqual([]);
  });

  it("surfaces live price alert outages instead of returning an empty list", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.alphavyuh.test");
    vi.stubEnv("NEXT_PUBLIC_FORCE_LIVE_DATA", "true");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "live");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_FALLBACK", "false");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ detail: "Price alerts are temporarily unavailable." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )));

    const { getPriceAlerts } = await import("@/lib/api");

    await expect(getPriceAlerts()).rejects.toThrow("Price alerts are temporarily unavailable.");
  });

  it("rejects unavailable price alert payloads", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.alphavyuh.test");
    vi.stubEnv("NEXT_PUBLIC_FORCE_LIVE_DATA", "true");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "live");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_FALLBACK", "false");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ status: "unavailable", alerts: [], message: "Price alerts are temporarily unavailable." }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    const { getPriceAlerts } = await import("@/lib/api");

    await expect(getPriceAlerts()).rejects.toThrow("Price alerts are temporarily unavailable.");
  });

  it("keeps failed deletes visible to the caller", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.alphavyuh.test");
    vi.stubEnv("NEXT_PUBLIC_FORCE_LIVE_DATA", "true");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "live");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_FALLBACK", "false");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ detail: "Price alerts are temporarily unavailable." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )));

    const { deletePriceAlert } = await import("@/lib/api");

    await expect(deletePriceAlert("alert-1")).rejects.toThrow("Price alerts are temporarily unavailable.");
  });
});
