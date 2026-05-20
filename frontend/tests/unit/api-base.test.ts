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

  it("supports same-origin recovery API deployments", async () => {
    const { normalizeApiBaseUrl, apiUrl } = await import("@/lib/api-base");

    expect(normalizeApiBaseUrl("same-origin")).toBe("");
    expect(normalizeApiBaseUrl("self")).toBe("");
    expect(normalizeApiBaseUrl(".")).toBe("");
    expect(apiUrl("/api/v1/health")).toBe("http://localhost:8000/api/v1/health");
  });

  it("exports a sanitized API_BASE_URL from the environment", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", '"https://api.alphavyuh.test\\n/"');
    const { API_BASE_URL, apiUrl } = await import("@/lib/api-base");

    expect(API_BASE_URL).toBe("https://api.alphavyuh.test");
    expect(apiUrl("/api/v1/health")).toBe("https://api.alphavyuh.test/api/v1/health");
  });

  it("builds relative API URLs when configured for same-origin recovery", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "same-origin");
    const { API_BASE_URL, apiUrl } = await import("@/lib/api-base");

    expect(API_BASE_URL).toBe("");
    expect(apiUrl("/api/v1/health")).toBe("/api/v1/health");
  });
});
