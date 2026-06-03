import { describe, expect, it } from "vitest";

import { redactSensitiveFeedbackUrl } from "@/lib/feedback-context";

describe("feedback context sanitizing", () => {
  it("redacts broker callback secrets from absolute feedback URLs", () => {
    const href = redactSensitiveFeedbackUrl("https://www.alphavyuh.com/broker/callback?broker=zerodha&request_token=rt_123&state=oauth-state&code=code_123");

    expect(href).toContain("broker=zerodha");
    expect(href).toContain("request_token=%5Bredacted%5D");
    expect(href).toContain("state=%5Bredacted%5D");
    expect(href).toContain("code=%5Bredacted%5D");
    expect(href).not.toContain("rt_123");
    expect(href).not.toContain("oauth-state");
    expect(href).not.toContain("code_123");
  });

  it("redacts sensitive relative feedback URLs", () => {
    const href = redactSensitiveFeedbackUrl("/broker/callback?request_token=rt_123&tab=broker#done");

    expect(href).toBe("/broker/callback?request_token=%5Bredacted%5D&tab=broker#done");
  });
});
