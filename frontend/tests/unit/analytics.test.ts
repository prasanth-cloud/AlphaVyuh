import { afterEach, describe, expect, it, vi } from "vitest";
import { trackEvent } from "@/lib/analytics";

describe("trackEvent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("no-ops when analytics providers are absent", () => {
    expect(() => trackEvent("scanner_run", { results: 12 })).not.toThrow();
  });

  it("forwards access funnel events to configured providers", () => {
    const va = vi.fn();
    const gtag = vi.fn();
    vi.stubGlobal("window", { va, gtag });

    trackEvent("add_to_watchlist", { source: "scanner", symbol: "AUBANK" });

    expect(va).toHaveBeenCalledWith("add_to_watchlist", { source: "scanner", symbol: "AUBANK" });
    expect(gtag).toHaveBeenCalledWith("event", "add_to_watchlist", { source: "scanner", symbol: "AUBANK" });
  });
});
