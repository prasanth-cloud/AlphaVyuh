import { afterEach, describe, expect, it, vi } from "vitest";
import {
  allowClientMockFallback,
  allowMockAppAuth,
  allowPreviewMockAuth,
  hasSupabasePublicEnv,
  isPublicProductionRuntime,
} from "@/lib/runtime-mode";

describe("runtime mode guards", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("keeps normal Supabase-backed environments out of preview mock auth", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");

    expect(hasSupabasePublicEnv()).toBe(true);
    expect(allowPreviewMockAuth()).toBe(false);
    expect(allowMockAppAuth()).toBe(false);
  });

  it("allows protected preview QA to use mock auth when Supabase env is absent", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    expect(hasSupabasePublicEnv()).toBe(false);
    expect(allowPreviewMockAuth()).toBe(true);
    expect(allowMockAppAuth()).toBe(true);
    expect(allowClientMockFallback()).toBe(true);
  });

  it("does not enable preview mock auth when live data is forced", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_FORCE_LIVE_DATA", "true");

    expect(allowPreviewMockAuth()).toBe(false);
    expect(allowMockAppAuth()).toBe(false);
    expect(allowClientMockFallback()).toBe(false);
  });

  it("does not allow production deployments to silently use demo data", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "mock");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_FALLBACK", "true");
    vi.stubEnv("NEXT_PUBLIC_FORCE_LIVE_DATA", "false");

    expect(isPublicProductionRuntime()).toBe(true);
    expect(allowClientMockFallback()).toBe(false);
  });

  it("still allows unauthenticated preview mock fallback", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "mock");

    expect(isPublicProductionRuntime()).toBe(false);
    expect(allowClientMockFallback()).toBe(true);
  });

  it.each(["", "https://example.supabase.co"])(
    "fails closed in production even with incomplete config and a stray QA flag (%s)",
    (url) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("VERCEL_ENV", "production");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
      vi.stubEnv("PLAYWRIGHT_MOCK_AUTH", "true");
      vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "mock");
      vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_FALLBACK", "true");

      expect(isPublicProductionRuntime()).toBe(true);
      expect(allowMockAppAuth()).toBe(false);
      expect(allowClientMockFallback()).toBe(false);
    },
  );

  it("fails closed in a self-hosted production build without provider config", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    expect(allowClientMockFallback()).toBe(false);
  });

  it("keeps browser preview data available without granting server auth bypass", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "preview");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubGlobal("window", {});

    expect(allowClientMockFallback()).toBe(true);
    expect(allowMockAppAuth()).toBe(false);
  });

  it.each(["production", ""])("fails closed in the browser outside a preview (%s)", (deployment) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", deployment);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "mock");
    vi.stubGlobal("window", {});

    expect(allowClientMockFallback()).toBe(false);
  });

  it("ignores a forged public preview marker on the production server", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "preview");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    expect(allowMockAppAuth()).toBe(false);
    expect(allowClientMockFallback()).toBe(false);
  });
});
