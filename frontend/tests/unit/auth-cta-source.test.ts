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

  it("names the signup password visibility toggle for assistive technology", () => {
    expect(signupSource).toContain("aria-label={showPass ? \"Hide password\" : \"Show password\"}");
    expect(signupSource).toContain("title={showPass ? \"Hide password\" : \"Show password\"}");
    expect(signupSource).toContain("aria-hidden=\"true\"");
  });

  it("keeps login simple with autocomplete and a password visibility toggle", () => {
    expect(loginSource).toContain('autoComplete="email"');
    expect(loginSource).toContain('autoComplete="current-password"');
    expect(loginSource).toContain('autoCapitalize="none"');
    expect(loginSource).toContain('autoCorrect="off"');
    expect(loginSource).toContain("spellCheck={false}");
    expect(loginSource).toContain('inputMode="email"');
    expect(loginSource).toContain('enterKeyHint="next"');
    expect(loginSource).toContain('enterKeyHint="go"');
    expect(loginSource).toContain("onBlur={() => setEmail((value) => normalizeLoginEmail(value))}");
    expect(loginSource).toContain('aria-label={showPass ? "Hide password" : "Show password"}');
    expect(loginSource).toContain('title={showPass ? "Hide password" : "Show password"}');
    expect(loginSource).toContain("Continue");
  });

  it("makes returning login faster without storing sensitive credentials", () => {
    expect(loginSource).toContain("LAST_LOGIN_EMAIL_KEY");
    expect(loginSource).toContain("normalizeLoginEmail");
    expect(loginSource).toContain("readLastLoginEmail");
    expect(loginSource).toContain("writeLastLoginEmail(normalizedEmail)");
    expect(loginSource).toContain("clearLastLoginEmail");
    expect(loginSource).toContain("useAnotherAccount");
    expect(loginSource).toContain("Remembered email");
    expect(loginSource).toContain("Use another account");
    expect(loginSource).toContain("router.prefetch(safeNextPath)");
    expect(loginSource).toContain("emailRef.current?.focus()");
    expect(loginSource).toContain("passwordRef.current?.focus()");
    expect(loginSource).not.toContain("localStorage.setItem(\"password\"");
  });

  it("keeps credential recovery obvious without showing it for service outages", () => {
    expect(loginSource).toContain("showPasswordRecovery");
    expect(loginSource).toContain("/password|credentials/i.test(error)");
    expect(loginSource).toContain("!/temporarily unavailable/i.test(error)");
    expect(loginSource).toContain("Reset password");
    expect(loginSource).toContain("role=\"alert\"");
  });
});
