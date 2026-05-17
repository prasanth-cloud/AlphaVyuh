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

describe("mock scan alerts", () => {
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

  it("creates an EOD scan alert with a recent match snapshot", async () => {
    const { createAlert, getRecentAlertMatches, listAlerts } = await import("@/lib/api");

    const created = await createAlert({
      name: "52W High Review",
      filters: { week_52_high_pct_max: 5, series: ["EQ"] },
      sort_by: "volume_ratio",
      sort_order: "desc",
    });

    expect(created).toMatchObject({
      name: "52W High Review",
      is_active: true,
      sort_by: "volume_ratio",
      sort_order: "desc",
    });

    const alerts = await listAlerts();
    expect(alerts.some((alert) => alert.id === created.id)).toBe(true);

    const matches = await getRecentAlertMatches();
    const createdMatch = matches.find((match) => match.alert_id === created.id);
    expect(createdMatch).toMatchObject({
      alert_id: created.id,
      scan_alerts: { name: "52W High Review" },
    });
    expect(createdMatch?.symbols.length).toBeGreaterThan(0);
  });

  it("pauses, resumes, and deletes local scan alerts", async () => {
    const { deleteAlert, listAlerts, updateAlert } = await import("@/lib/api");

    const [existing] = await listAlerts();
    const paused = await updateAlert(existing.id, { is_active: false });
    expect(paused.is_active).toBe(false);

    const resumed = await updateAlert(existing.id, { is_active: true });
    expect(resumed.is_active).toBe(true);

    await deleteAlert(existing.id);
    expect((await listAlerts()).some((alert) => alert.id === existing.id)).toBe(false);
  });
});
