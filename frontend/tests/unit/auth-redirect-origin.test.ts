import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAuthRedirectOrigin,
  resolveAuthCallbackNext,
} from "@/lib/auth-redirect-origin";

describe("getAuthRedirectOrigin", () => {
  beforeEach(() => {
    for (const name of ["PUBLIC_SITE_URL", "LIVE_URL", "NEXT_PUBLIC_SITE_URL", "VERCEL_ENV", "VERCEL_URL", "VERCEL_BRANCH_URL"]) {
      vi.stubEnv(name, "");
    }
  });
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

  describe("trusted Vercel preview origins", () => {
    const deployment = "https://alphavyuh-a1b2c3-prasanth-cloud.vercel.app";
    const branch = "https://alphavyuh-git-fix-portfolio-prasanth-cloud.vercel.app";

    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("VERCEL_ENV", "preview");
      vi.stubEnv("VERCEL_URL", new URL(deployment).host);
      vi.stubEnv("VERCEL_BRANCH_URL", new URL(branch).host);
    });

    it("keeps deployment confirmation links on the same preview origin", () => {
      expect(getAuthRedirectOrigin(deployment)).toBe(deployment);
    });

    it("keeps branch-alias confirmation links on the branch to preserve PKCE cookies", () => {
      expect(getAuthRedirectOrigin(branch)).toBe(branch);
    });

    it.each(["https://spoofed.example", "https://another-project.vercel.app", "https://alphavyuh-a1b2c3-prasanth-cloud.vercel.app.evil.example"])("does not trust an unconfigured request host %s", (origin) => {
      expect(getAuthRedirectOrigin(origin)).toBe(deployment);
    });

    it.each(["http://alphavyuh-git-fix-portfolio-prasanth-cloud.vercel.app", "not a URL", "https://user:password@alphavyuh-git-fix-portfolio-prasanth-cloud.vercel.app", `${branch}/extra`, `${branch}?next=evil`, `${branch}#evil`, `${branch}:8443`])("rejects an insecure or malformed request origin %s", (origin) => {
      expect(getAuthRedirectOrigin(origin)).toBe(deployment);
    });

    it("accepts explicitly HTTPS-prefixed trusted system URLs", () => {
      vi.stubEnv("VERCEL_URL", deployment);
      vi.stubEnv("VERCEL_BRANCH_URL", branch);
      expect(getAuthRedirectOrigin(branch)).toBe(branch);
    });

    it.each(["http://bad.vercel.app", "https://user:password@bad.vercel.app", "https://bad.vercel.app/path", "https://bad.vercel.app?query", "https://bad.vercel.app#hash", "https://bad.vercel.app:8443", "//bad.vercel.app", "bad.vercel.app.evil.example", "bad.vercel.app/path", "bad host.vercel.app"])("ignores malformed Vercel deployment metadata %s", (value) => {
      vi.stubEnv("VERCEL_URL", value);
      expect(getAuthRedirectOrigin("https://spoofed.example")).toBe(branch);
    });

    it("uses the canonical fallback when no trusted preview origin is available", () => {
      vi.stubEnv("VERCEL_URL", "http://bad.vercel.app");
      vi.stubEnv("VERCEL_BRANCH_URL", "");
      expect(getAuthRedirectOrigin("https://spoofed.example")).toBe("https://www.alphavyuh.com");
    });

    it("keeps explicit site configuration authoritative", () => {
      vi.stubEnv("PUBLIC_SITE_URL", "https://preview.alphavyuh.com/access");
      expect(getAuthRedirectOrigin(branch)).toBe("https://preview.alphavyuh.com");
    });

    it("does not use preview system URLs for production", () => {
      vi.stubEnv("VERCEL_ENV", "production");
      expect(getAuthRedirectOrigin(branch)).toBe("https://www.alphavyuh.com");
      vi.stubEnv("PUBLIC_SITE_URL", "https://www.alphavyuh.com/access");
      expect(getAuthRedirectOrigin(deployment)).toBe("https://www.alphavyuh.com");
    });
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
