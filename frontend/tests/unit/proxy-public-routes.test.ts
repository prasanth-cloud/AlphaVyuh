import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { hasSupabaseAuthConfig, isPublicPath, proxy } from "@/proxy";

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

  it("lets an unsigned email-confirmation callback reach token verification in live mode", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("PLAYWRIGHT_MOCK_AUTH", "false");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const response = await proxy(new NextRequest("https://www.alphavyuh.com/auth/callback?code=confirmation"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("exposes only the exact callback/error paths outside the auth gate", () => {
    expect(isPublicPath("/auth/callback")).toBe(true);
    expect(isPublicPath("/auth/error")).toBe(true);
    expect(isPublicPath("/auth/callback-extra")).toBe(false);
    expect(isPublicPath("/auth/private")).toBe(false);
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
