import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const callbackSource = readFileSync("app/auth/callback/route.ts", "utf8");
const docsSource = readFileSync("../docs/auth-email-templates.md", "utf8");
const templates = {
  confirmation: readFileSync("../supabase/templates/confirmation.html", "utf8"),
  magiclink: readFileSync("../supabase/templates/magic-link.html", "utf8"),
  invite: readFileSync("../supabase/templates/invite.html", "utf8"),
  recovery: readFileSync("../supabase/templates/recovery.html", "utf8"),
};

describe("auth email verification contract", () => {
  it("supports both current token-hash emails and existing PKCE code links", () => {
    expect(callbackSource).toContain('requestUrl.searchParams.get("code")');
    expect(callbackSource).toContain('requestUrl.searchParams.get("token_hash")');
    expect(callbackSource).toContain("supabase.auth.exchangeCodeForSession(code)");
    expect(callbackSource).toContain("supabase.auth.verifyOtp");
    expect(callbackSource).toContain("resolveAuthCallbackNext");
  });

  it("routes every hosted email template through the server callback", () => {
    expect(templates.confirmation).toContain("token_hash={{ .TokenHash }}&amp;type=email");
    expect(templates.magiclink).toContain("token_hash={{ .TokenHash }}&amp;type=magiclink");
    expect(templates.invite).toContain("token_hash={{ .TokenHash }}&amp;type=invite");
    expect(templates.recovery).toContain("token_hash={{ .TokenHash }}&amp;type=recovery");
    Object.values(templates).forEach((template) => {
      expect(template).toContain("/auth/callback?");
      expect(template).toContain("&amp;next={{ .RedirectTo }}");
      expect(template).not.toContain("{{ .ConfirmationURL }}");
    });
    expect(docsSource).toContain("verifies the token server-side");
  });
});
