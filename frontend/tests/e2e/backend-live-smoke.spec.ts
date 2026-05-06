import { expect, test } from "@playwright/test";
import crypto from "node:crypto";

function base64Url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function signedSupabaseJwt() {
  const secret = process.env.PLAYWRIGHT_SUPABASE_JWT_SECRET ?? "playwright-secret";
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    aud: "authenticated",
    exp: now + 3600,
    iat: now,
    role: "authenticated",
    sub: "00000000-0000-4000-8000-000000000001",
  }));
  const signature = crypto.createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

const authHeaders = {
  Authorization: `Bearer ${signedSupabaseJwt()}`,
  "Content-Type": "application/json",
};

test.describe("Live backend smoke", () => {
  test("public data endpoints fail soft over real HTTP", async ({ request }) => {
    const health = await request.get("/health");
    expect(health.ok()).toBeTruthy();
    await expect(health).toBeOK();
    await expect.poll(async () => (await health.json()).status).toBe("ok");

    const dataHealth = await request.get("/api/v1/data/health");
    expect(dataHealth.status()).toBe(200);
    const dataHealthJson = await dataHealth.json();
    expect(dataHealthJson).toHaveProperty("status");
    expect(dataHealthJson).toHaveProperty("message");

    const presets = await request.get("/api/v1/scanner/presets");
    expect(presets.status()).toBe(200);
    expect((await presets.json()).length).toBeGreaterThan(0);

    const candles = await request.get("/api/v1/charts/AUBANK/candles?timeframe=D&limit=5");
    expect(candles.status()).toBe(200);
    const candlesJson = await candles.json();
    expect(candlesJson).toMatchObject({ symbol: "AUBANK", timeframe: "D" });
    expect(candlesJson).toHaveProperty("candles");
  });

  test("authenticated workflow endpoints return controlled responses over real HTTP", async ({ request }) => {
    const scanner = await request.post("/api/v1/scanner/run", {
      headers: authHeaders,
      data: { filters: { series: ["EQ"] }, page: 1, page_size: 25 },
    });
    expect(scanner.status()).toBe(200);
    const scannerJson = await scanner.json();
    expect(scannerJson).toHaveProperty("results");
    expect(Array.isArray(scannerJson.results)).toBe(true);

    const overview = await request.get("/api/v1/market/overview", { headers: authHeaders });
    expect(overview.status()).toBe(200);
    const overviewJson = await overview.json();
    expect(overviewJson).toHaveProperty("market_phase");
    expect(overviewJson).toHaveProperty("indices");
  });

  test("broker routes expose setup and disconnected states without live credentials", async ({ request }) => {
    const start = await request.post("/api/brokers/upstox/connect/start", { headers: authHeaders });
    expect(start.status()).toBe(200);
    const startJson = await start.json();
    expect(startJson.auth_url).toContain("api.upstox.com/v2/login/authorization/dialog");
    expect(startJson.auth_url).toContain("client_id=upstox-test-key");

    const profile = await request.get("/api/brokers/upstox/profile", { headers: authHeaders });
    expect(profile.status()).toBe(401);
    expect((await profile.json()).detail).toContain("not connected");
  });
});
