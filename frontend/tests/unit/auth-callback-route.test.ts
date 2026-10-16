import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextResponse } from "next/server";
import { GET } from "@/app/auth/callback/route";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), exchange: vi.fn(), verifyOtp: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient: mocks.createClient }));
vi.mock("@/lib/auth-redirect-origin", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth-redirect-origin")>(),
  getAuthRedirectOrigin: () => "https://www.alphavyuh.com",
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.exchange.mockResolvedValue({ data: { session: { access_token: "test" } }, error: null });
  mocks.verifyOtp.mockResolvedValue({ data: { session: { access_token: "test" } }, error: null });
  mocks.createClient.mockImplementation(async (response: NextResponse) => {
    response.cookies.set("sb-callback-session", "test", { httpOnly: true });
    return { auth: { exchangeCodeForSession: mocks.exchange, verifyOtp: mocks.verifyOtp } };
  });
});

function request(query = "") {
  return new Request(`https://untrusted.example/auth/callback${query}`);
}

describe("auth callback integration boundary", () => {
  it("exchanges a PKCE code and returns the cookie-bearing response", async () => {
    const response = await GET(request("?code=test-code&next=%2Fscanner%3Fpreset%3Dvcp"));
    expect(response.headers.get("location")).toBe("https://www.alphavyuh.com/scanner?preset=vcp");
    expect(response.headers.get("set-cookie")).toContain("sb-callback-session=test");
    expect(mocks.exchange).toHaveBeenCalledWith("test-code");
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("accepts the token-hash confirmation template and nested safe next", async () => {
    const next = encodeURIComponent("https://www.alphavyuh.com/auth/callback?next=%2Fonboarding");
    const response = await GET(request(`?token_hash=test-hash&type=email&next=${next}`));
    expect(response.headers.get("location")).toBe("https://www.alphavyuh.com/onboarding");
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "test-hash", type: "email" });
  });

  it.each(["?token_hash=test-hash&type=invalid", "?type=email", ""])("rejects incomplete callbacks without contacting Supabase: %s", async (query) => {
    const response = await GET(request(query));
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("keeps a safe destination after an expired confirmation link", async () => {
    mocks.exchange.mockResolvedValue({ data: { session: null }, error: { code: "otp_expired", status: 403 } });
    const response = await GET(request("?code=expired-secret-code&next=%2Fscanner"));
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("auth_callback_failed");
    expect(location.searchParams.get("next")).toBe("/scanner");
    expect(location.href).not.toContain("expired-secret-code");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each(["client", "exchange"])("handles thrown %s failures without a 500 or leaked detail", async (source) => {
    const failure = new Error("secret provider detail");
    if (source === "client") mocks.createClient.mockRejectedValue(failure);
    else mocks.exchange.mockRejectedValue(failure);
    const response = await GET(request("?code=test-code&next=%2Fscanner"));
    const location = new URL(response.headers.get("location")!);
    expect(location.searchParams.get("error")).toBe("auth_service_unavailable");
    expect(location.searchParams.get("next")).toBe("/scanner");
    expect(location.href).not.toContain("secret");
  });

  it("distinguishes an auth service outage from an expired link", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: null, error: { message: "exceed_db_size_quota", status: 403 } });
    const response = await GET(request("?token_hash=test-hash&type=email"));
    expect(new URL(response.headers.get("location")!).searchParams.get("error")).toBe("auth_service_unavailable");
  });

  it("does not redirect into the app without a returned session", async () => {
    mocks.exchange.mockResolvedValue({ data: { session: null }, error: null });
    const response = await GET(request("?code=test-code"));
    expect(new URL(response.headers.get("location")!).searchParams.get("error")).toBe("auth_service_unavailable");
  });

  it("does not carry external next targets into a failed login redirect", async () => {
    mocks.exchange.mockResolvedValue({ data: null, error: { status: 400 } });
    const response = await GET(request("?code=test-code&next=https%3A%2F%2Fevil.example"));
    const location = new URL(response.headers.get("location")!);
    expect(location.origin).toBe("https://www.alphavyuh.com");
    expect(location.searchParams.get("next")).toBe("/dashboard");
  });
});
