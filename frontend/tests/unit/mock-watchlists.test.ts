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

describe("mock watchlists", () => {
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

  it("persists scanner-created watchlists locally and keeps them selectable by id", async () => {
    const { addToWatchlist, createWatchlist, getWatchlists } = await import("@/lib/api");

    const created = await createWatchlist("Scanner Picks");
    await addToWatchlist(created.id, "RELIANCE");
    await addToWatchlist(created.id, "DIXON");

    const lists = await getWatchlists();
    const scannerList = lists.find((watchlist) => watchlist.id === created.id);

    expect(scannerList).toMatchObject({
      id: created.id,
      name: "Scanner Picks",
    });
    expect(scannerList?.items.map((item) => item.symbol)).toEqual(["RELIANCE", "DIXON"]);
  });
});
