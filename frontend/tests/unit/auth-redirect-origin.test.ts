import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAuthRedirectOrigin,
  resolveAuthCallbackNext,
} from "@/lib/auth-redirect-origin";

describe("getAuthRedirectOrigin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the configured public site origin for auth links", () => {
    vi.stubEnv("PUBLIC_SITE_URL", "https://www.alphavyuh.com/access");

    expect(getAuthRedirectOrigin("https://spoofed.example")).toBe("https://www.alphavyuh.com");
  });

  it("falls back to the production AlphaVyuh origin instead of trusting request origin", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(getAuthRedirectOrigin("https://spoofed.example")).toBe("https://www.alphavyuh.com");
  });

  it("keeps local development redirects on the current request origin", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(getAuthRedirectOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("accepts a safe relative next destination", () => {
    expect(resolveAuthCallbackNext("/scanner?preset=vcp", "https://www.alphavyuh.com"))
      .toBe("/scanner?preset=vcp");
  });

  it("extracts next from the same-origin callback URL supplied by an email template", () => {
    expect(resolveAuthCallbackNext(
      "https://www.alphavyuh.com/auth/callback?next=%2Fonboarding",
      "https://www.alphavyuh.com",
    )).toBe("/onboarding");
  });

  it("rejects external and malformed email-template redirect targets", () => {
    expect(resolveAuthCallbackNext(
      "https://evil.example/auth/callback?next=%2Fscanner",
      "https://www.alphavyuh.com",
    )).toBe("/dashboard");
    expect(resolveAuthCallbackNext(
      "https://www.alphavyuh.com/not-callback?next=%2Fscanner",
      "https://www.alphavyuh.com",
    )).toBe("/dashboard");
    expect(resolveAuthCallbackNext("not a url", "https://www.alphavyuh.com"))
      .toBe("/dashboard");
  });
});
