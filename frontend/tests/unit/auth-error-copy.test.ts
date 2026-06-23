import { describe, expect, it } from "vitest";
import {
  AUTH_SERVICE_RESTRICTED_MESSAGE,
  getSafeAuthErrorMessage,
} from "@/lib/auth-error-copy";

describe("getSafeAuthErrorMessage", () => {
  it("hides Supabase quota and spend-cap details from auth UI", () => {
    const message = getSafeAuthErrorMessage(
      new Error(
        "Service for this project is restricted due to the following violations: exceed_db_size_quota. The project owner must upgrade their plan or remove spend caps to restore service.",
      ),
      "Could not sign in.",
    );

    expect(message).toBe(AUTH_SERVICE_RESTRICTED_MESSAGE);
    expect(message).not.toContain("exceed_db_size_quota");
    expect(message).not.toContain("upgrade their plan");
  });

  it("uses a standard invalid-credentials error", () => {
    expect(getSafeAuthErrorMessage(new Error("Invalid login credentials"), "Could not sign in.")).toBe(
      "Invalid email or password.",
    );
  });

  it("falls back for unknown provider errors", () => {
    expect(getSafeAuthErrorMessage(new Error("unexpected provider error"), "Could not sign in.")).toBe(
      "Could not sign in.",
    );
  });
});
