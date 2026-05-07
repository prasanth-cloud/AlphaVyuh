import { describe, it, expect } from "vitest";
import { isSafeRedirect } from "@/lib/safe-redirect";

describe("isSafeRedirect", () => {
  it("accepts a normal relative path", () => {
    expect(isSafeRedirect("/dashboard")).toBe(true);
  });

  it("accepts nested paths", () => {
    expect(isSafeRedirect("/settings/billing")).toBe(true);
  });

  it("rejects null", () => {
    expect(isSafeRedirect(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isSafeRedirect(undefined)).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isSafeRedirect("")).toBe(false);
  });

  it("rejects protocol-relative URL //evil.com", () => {
    expect(isSafeRedirect("//evil.com")).toBe(false);
  });

  it("rejects backslash variant /\\evil.com", () => {
    expect(isSafeRedirect("/\\evil.com")).toBe(false);
  });

  it("rejects encoded protocol-relative URL", () => {
    expect(isSafeRedirect("/%2F%2Fevil.com")).toBe(false);
  });

  it("rejects encoded backslash variant", () => {
    expect(isSafeRedirect("/%5Cevil.com")).toBe(false);
  });

  it("rejects control characters", () => {
    expect(isSafeRedirect("/dashboard%0ASet-Cookie:%20bad=1")).toBe(false);
  });

  it("rejects absolute URL https://evil.com", () => {
    expect(isSafeRedirect("https://evil.com")).toBe(false);
  });

  it("rejects javascript: scheme", () => {
    expect(isSafeRedirect("javascript:alert(1)")).toBe(false);
  });

  it("rejects path that does not start with /", () => {
    expect(isSafeRedirect("evil.com")).toBe(false);
  });
});
