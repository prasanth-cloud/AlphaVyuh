import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("mock launch fallbacks", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "mock");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_FALLBACK", "true");
    vi.stubGlobal("fetch", vi.fn(() => {
      throw new Error("mock mode should not call the backend for launch fallbacks");
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("keeps billing, referral, and community surfaces quiet without a backend", async () => {
    const { getPaymentConfig, getReferralCode, getSharedScreens, upvoteScreen } = await import("@/lib/api");

    await expect(getPaymentConfig()).resolves.toMatchObject({ configured: false, mode: "disabled" });
    await expect(getReferralCode()).resolves.toMatchObject({ referral_code: "DEMOALPHA" });

    const screens = await getSharedScreens();
    expect(screens.length).toBeGreaterThan(0);
    expect(screens[0].tags).toContain("Demo");
    await expect(upvoteScreen(screens[0].id)).resolves.toMatchObject({ upvotes: screens[0].upvotes + 1 });

    expect(fetch).not.toHaveBeenCalled();
  });
});
