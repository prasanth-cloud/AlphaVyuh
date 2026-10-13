import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextResponse } from "next/server";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as resend } from "@/app/api/auth/resend-confirmation/route";
import { AUTH_SERVICE_RESTRICTED_MESSAGE } from "@/lib/auth-error-copy";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  resend: vi.fn(),
  allowMockAuth: vi.fn(() => false),
}));

vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient: mocks.createClient }));
vi.mock("@/lib/runtime-mode", () => ({ allowMockAppAuth: mocks.allowMockAuth }));
vi.mock("@/lib/auth-redirect-origin", () => ({ getAuthRedirectOrigin: () => "https://www.alphavyuh.com" }));

const validBody = { email: "Trader@Example.com", password: "secure-password", full_name: "Trader" };
const routes = [
  { name: "login", handler: login, provider: mocks.signIn },
  { name: "signup", handler: signup, provider: mocks.signUp },
  { name: "resend", handler: resend, provider: mocks.resend },
];

function request(body: unknown) {
  return new Request("https://www.alphavyuh.com/api/auth/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.allowMockAuth.mockReturnValue(false);
  mocks.signIn.mockResolvedValue({ data: { session: { access_token: "test-session" } }, error: null });
  mocks.signUp.mockResolvedValue({ data: { session: { access_token: "test-session" } }, error: null });
  mocks.resend.mockResolvedValue({ error: null });
  mocks.createClient.mockImplementation(async (response: NextResponse) => {
    response.cookies.set("sb-test-session", "test-cookie", { httpOnly: true });
    return { auth: { signInWithPassword: mocks.signIn, signUp: mocks.signUp, resend: mocks.resend } };
  });
});

describe.each(routes)("$name auth boundary", ({ handler, provider }) => {
  it.each([null, [], "email@example.com", 42].map((body) => ({ body })))("rejects a non-object body $body before calling Supabase", async ({ body }) => {
    const response = await handler(request(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Enter a valid email address." });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("returns JSON 400 for malformed JSON", async () => {
    const response = await handler(new Request("https://www.alphavyuh.com/api/auth/test", {
      method: "POST", body: "{invalid",
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Enter a valid email address." });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 42, {}, "", "bad@", "a@@example.com", "a b@example.com"])("rejects invalid email %j", async (email) => {
    const response = await handler(request({ ...validBody, email }));
    expect(response.status).toBe(400);
    expect(provider).not.toHaveBeenCalled();
  });

  it("normalizes email and preserves the provider's cookie response", async () => {
    const response = await handler(request({ ...validBody, email: "  Trader@Example.com " }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(provider).toHaveBeenCalledWith(expect.objectContaining({ email: "trader@example.com" }));
    expect(response.headers.get("set-cookie")).toContain("sb-test-session=test-cookie");
  });

  it.each([
    { message: "Service restricted: exceed_db_size_quota", status: 403 },
    { message: "internal database details", status: 500 },
    { code: "unexpected_failure", message: "secret provider details", status: 400 },
    { code: "request_timeout", message: "timeout", status: 408 },
    { name: "AuthRetryableFetchError", message: "fetch failed", status: 0 },
  ])("reports provider outages as 503: %j", async (error) => {
    provider.mockResolvedValue({ data: { session: null }, error });
    const response = await handler(request(validBody));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toContain("temporarily unavailable");
    expect(JSON.stringify(body)).not.toMatch(/quota|internal database|secret provider|fetch failed/);
  });

  it("retains safe quota recovery copy", async () => {
    provider.mockResolvedValue({ data: null, error: { message: "exceed_db_size_quota", status: 403 } });
    const response = await handler(request(validBody));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: AUTH_SERVICE_RESTRICTED_MESSAGE });
  });

  it.each(["client", "provider"])("handles thrown %s failures without disclosing the exception", async (source) => {
    const error = new Error("secret transport credentials");
    if (source === "client") mocks.createClient.mockRejectedValue(error);
    else provider.mockRejectedValue(error);
    const response = await handler(request(validBody));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("temporarily unavailable");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each([
    { code: "over_request_rate_limit", message: "not a user-facing message", status: 400 },
    { code: "over_email_send_rate_limit", message: "not a user-facing message", status: 429 },
    { message: "Too many requests", status: 429 },
  ])("preserves rate-limit semantics: %j", async (error) => {
    provider.mockResolvedValue({ data: null, error });
    const response = await handler(request(validBody));
    expect(response.status).toBe(429);
    expect((await response.json()).error).toContain("Please wait");
  });
});

describe.each(routes.slice(0, 2))("$name password validation", ({ handler, provider }) => {
  it.each([undefined, null, {}, 123, ""])("rejects a missing or non-string password %j", async (password) => {
    const response = await handler(request({ ...validBody, password }));
    expect(response.status).toBe(400);
    expect(provider).not.toHaveBeenCalled();
  });

  it("validates requests even when mock auth is enabled", async () => {
    mocks.allowMockAuth.mockReturnValue(true);
    const response = await handler(request({ email: "" }));
    expect(response.status).toBe(400);
  });
});

describe("login", () => {
  it("identifies an unconfirmed email so the login form can offer a fresh link", async () => {
    mocks.signIn.mockResolvedValue({ data: null, error: { code: "email_not_confirmed", status: 400 } });
    const response = await login(request(validBody));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      code: "email_not_confirmed",
      error: "Confirm your email before signing in. You can request a fresh confirmation link.",
    });
  });

  it("keeps invalid credentials as 401", async () => {
    mocks.signIn.mockResolvedValue({ data: { session: null }, error: { code: "invalid_credentials", status: 400 } });
    const response = await login(request(validBody));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Invalid email or password." });
  });

  it("does not call a missing session a credential failure", async () => {
    mocks.signIn.mockResolvedValue({ data: { session: null }, error: null });
    expect((await login(request(validBody))).status).toBe(503);
  });

  it("passes the password unchanged", async () => {
    await login(request({ ...validBody, password: " padded password " }));
    expect(mocks.signIn).toHaveBeenCalledWith(expect.objectContaining({ password: " padded password " }));
  });
});

describe("signup", () => {
  it.each([null, 123, {}, " ", "x".repeat(201)])("rejects invalid optional full-name metadata %j", async (full_name) => {
    expect((await signup(request({ ...validBody, full_name }))).status).toBe(400);
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("rejects passwords shorter than the signup form minimum", async () => {
    expect((await signup(request({ ...validBody, password: "short" }))).status).toBe(400);
  });

  it.each([
    { code: "user_already_exists", message: "opaque provider wording" },
    { code: "email_exists", message: "opaque provider wording" },
    { message: "User already registered" },
  ])("keeps duplicate-account errors indistinguishable from pending confirmation: %j", async (error) => {
    mocks.signUp.mockResolvedValue({ data: { session: null }, error });
    const response = await signup(request(validBody));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ pending_confirmation: true });
  });

  it("returns pending confirmation when signup succeeds without a session", async () => {
    mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
    const response = await signup(request(validBody));
    expect(await response.json()).toEqual({ pending_confirmation: true });
    expect(response.headers.get("set-cookie")).toContain("sb-test-session=test-cookie");
  });
});

describe.each(routes.slice(1))("$name redirects", ({ handler, provider }) => {
  it.each([42, {}, [], "https://evil.example", "//evil.example"].map((next) => ({ next })))("uses a safe default for next=$next", async ({ next }) => {
    expect((await handler(request({ ...validBody, next }))).status).toBe(200);
    expect(provider).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({ emailRedirectTo: expect.stringMatching(/^https:\/\/www\.alphavyuh\.com\/auth\/callback\?next=%2F(onboarding|dashboard)$/) }),
    }));
  });

  it("preserves safe next destinations", async () => {
    await handler(request({ ...validBody, next: "/scanner?preset=vcp" }));
    expect(provider).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({ emailRedirectTo: "https://www.alphavyuh.com/auth/callback?next=%2Fscanner%3Fpreset%3Dvcp" }),
    }));
  });
});

describe("resend anti-enumeration", () => {
  it.each([
    { code: "user_not_found", message: "opaque provider wording" },
    { message: "User not found" },
    { message: "Email already confirmed" },
  ])("returns generic success for account state errors: %j", async (error) => {
    mocks.resend.mockResolvedValue({ error });
    const response = await resend(request(validBody));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });

  it("does not mistake a database quota for an email rate limit", async () => {
    mocks.resend.mockResolvedValue({ error: { message: "Database limit: exceed_db_size_quota", status: 403 } });
    expect((await resend(request(validBody))).status).toBe(503);
  });
});
