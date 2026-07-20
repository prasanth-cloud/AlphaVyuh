import { defineConfig } from "@playwright/test";

const port = process.env.PLAYWRIGHT_BACKEND_PORT ?? "8010";
const jwtSecret = process.env.PLAYWRIGHT_SUPABASE_JWT_SECRET ?? "playwright-secret";
const backendCommand = process.env.PLAYWRIGHT_BACKEND_COMMAND ?? "python -m uvicorn";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /backend-live-smoke\.spec\.ts/,
  fullyParallel: false,
  use: {
    baseURL: process.env.PLAYWRIGHT_BACKEND_URL ?? `http://127.0.0.1:${port}`,
    trace: "on-first-retry",
  },
  webServer: {
    command: [
      "cd ../backend",
      "&&",
      "env",
      "SUPABASE_URL=https://example.supabase.co",
      "SUPABASE_SERVICE_ROLE_KEY=test-service-role-key",
      `SUPABASE_JWT_SECRET=${jwtSecret}`,
      "FRONTEND_URL=http://localhost:3000",
      "MARKET_DATA_PROVIDER=mock",
      "ENABLE_YFINANCE_REFRESH=false",
      "BROKER_CREDS_KEY=0000000000000000000000000000000000000000000000000000000000000000",
      "UPSTOX_API_KEY=upstox-test-key",
      "UPSTOX_API_SECRET=upstox-test-secret",
      `UPSTOX_REDIRECT_URI=http://127.0.0.1:${port}/api/brokers/upstox/connect/callback`,
      `${backendCommand} app.main:app --host 127.0.0.1 --port ${port}`,
    ].join(" "),
    url: `http://127.0.0.1:${port}/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
