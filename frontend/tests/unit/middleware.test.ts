import { describe, expect, it } from "vitest";

import middleware, { config } from "@/middleware";

describe("middleware entrypoint", () => {
  it("re-exports the proxy handler as the default middleware", () => {
    expect(typeof middleware).toBe("function");
  });

  it("re-exports the proxy matcher config", () => {
    expect(Array.isArray(config.matcher)).toBe(true);
    expect(config.matcher.length).toBeGreaterThan(0);
  });
});
