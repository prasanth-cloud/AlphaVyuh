import { describe, expect, it, vi, afterEach } from "vitest";

describe("api base URL normalization", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("strips wrapping quotes, whitespace, literal escapes, and trailing slashes", async () => {
    const { normalizeApiBaseUrl } = await import("@/lib/api-base");

    expect(normalizeApiBaseUrl(' "https://api.alphavyuh.test\\n/" ')).toBe("https://api.alphavyuh.test");
    expect(normalizeApiBaseUrl(' "https://api.alphavyuh.test\\\\n/" ')).toBe("https://api.alphavyuh.test");
    expect(normalizeApiBaseUrl("\n'https://api.alphavyuh.test/'\t")).toBe("https://api.alphavyuh.test");
  });

  it("falls back to the local backend when no URL is configured", async () => {
    const { normalizeApiBaseUrl } = await import("@/lib/api-base");

    expect(normalizeApiBaseUrl("")).toBe("http://localhost:8000");
    expect(normalizeApiBaseUrl(null, "http://127.0.0.1:8011")).toBe("http://127.0.0.1:8011");
  });

  it("exports a sanitized API_BASE_URL from the environment", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", '"https://api.alphavyuh.test\\n/"');
    const { API_BASE_URL, apiUrl } = await import("@/lib/api-base");

    expect(API_BASE_URL).toBe("https://api.alphavyuh.test");
    expect(apiUrl("/api/v1/health")).toBe("https://api.alphavyuh.test/api/v1/health");
  });
});
