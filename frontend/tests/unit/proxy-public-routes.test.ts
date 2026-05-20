import { describe, expect, it } from "vitest";

import { isPublicPath } from "@/proxy";

describe("proxy public routes", () => {
  it("keeps health checks outside the auth gate", () => {
    expect(isPublicPath("/health")).toBe(true);
  });

  it("keeps protected app routes behind auth", () => {
    expect(isPublicPath("/charts/RELIANCE")).toBe(false);
  });
});
