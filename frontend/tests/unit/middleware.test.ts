import { describe, expect, it } from "vitest";

import { proxy, config } from "@/proxy";

describe("proxy entrypoint", () => {
  it("exports the Next.js proxy handler", () => {
    expect(typeof proxy).toBe("function");
  });

  it("exports the proxy matcher config", () => {
    expect(Array.isArray(config.matcher)).toBe(true);
    expect(config.matcher.length).toBeGreaterThan(0);
  });
});
