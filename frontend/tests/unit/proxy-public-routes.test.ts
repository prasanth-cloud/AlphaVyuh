import { afterEach, describe, expect, it, vi } from "vitest";

import { hasSupabaseAuthConfig, isPublicPath } from "@/proxy";

describe("proxy auth routing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps health checks and marketing pages outside the auth gate", () => {
    expect(isPublicPath("/health")).toBe(true);
    expect(isPublicPath("/about")).toBe(true);
    expect(isPublicPath("/privacy")).toBe(true);
    expect(isPublicPath("/terms")).toBe(true);
    expect(isPublicPath("/policies")).toBe(true);
  });

  it("keeps protected app routes behind auth", () => {
    expect(isPublicPath("/charts/RELIANCE")).toBe(false);
  });

  it("treats missing Supabase auth env as unavailable", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    expect(hasSupabaseAuthConfig()).toBe(false);
  });

  it("treats Supabase auth env as configured only when both values exist", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(hasSupabaseAuthConfig()).toBe(false);

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    expect(hasSupabaseAuthConfig()).toBe(true);
  });
});
