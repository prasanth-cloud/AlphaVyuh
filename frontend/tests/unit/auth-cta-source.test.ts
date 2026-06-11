import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const loginSource = readFileSync("components/auth/LoginForm.tsx", "utf8");
const signupSource = readFileSync("components/auth/SignupForm.tsx", "utf8");

describe("auth CTA consistency", () => {
  it("uses Request access on login and signup instead of create-account copy", () => {
    expect(loginSource).toContain("Request access");
    expect(loginSource).not.toContain("Create one");

    expect(signupSource).toContain("Request access");
    expect(signupSource).toContain("Submitting request…");
    expect(signupSource).not.toContain("Create account");
    expect(signupSource).not.toContain("Create your account");
  });
});
