import { describe, expect, it } from "vitest";

import { recoveryBearerToken, validateRecoveryApiRequest } from "@/lib/server/recovery-api-auth";

describe("recovery API auth", () => {
  it("extracts bearer tokens from authorization headers", () => {
    const request = new Request("https://alphavyuh.test/api/v1/scanner/run", {
      headers: { Authorization: "Bearer token-123" },
    });

    expect(recoveryBearerToken(request)).toBe("token-123");
  });

  it("rejects requests without a bearer token", async () => {
    const client = {
      auth: {
        getUser: async () => ({ data: { user: { id: "should-not-run" } }, error: null }),
      },
    };

    await expect(validateRecoveryApiRequest(new Request("https://alphavyuh.test/api/v1/scanner/run"), client as never)).resolves.toBe(false);
  });

  it("requires Supabase to validate the bearer token", async () => {
    const request = new Request("https://alphavyuh.test/api/v1/scanner/run", {
      headers: { Authorization: "Bearer token-123" },
    });
    const client = {
      auth: {
        getUser: async (token: string) => ({
          data: { user: token === "token-123" ? { id: "user-123" } : null },
          error: null,
        }),
      },
    };

    await expect(validateRecoveryApiRequest(request, client as never)).resolves.toBe(true);
  });
});
