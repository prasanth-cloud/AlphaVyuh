import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3003",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "NEXT_PUBLIC_DATA_MODE=mock NEXT_PUBLIC_ALLOW_MOCK_FALLBACK=true npm run dev -- --port 3003",
    url: "http://localhost:3003",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
