import { afterEach, describe, expect, it, vi } from "vitest";
import {
  allowClientMockFallback,
  allowMockAppAuth,
  allowPreviewMockAuth,
  hasSupabasePublicEnv,
} from "@/lib/runtime-mode";

describe("runtime mode guards", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
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
});
