import { defineConfig, devices } from "@playwright/test";

/** Records walkthrough videos for QA sign-off (mock auth, port 3002). */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  outputDir: "test-results/qa-videos",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3002",
    trace: "on",
    video: { mode: "on", size: { width: 1440, height: 900 } },
    screenshot: "on",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "NEXT_PUBLIC_DATA_MODE=mock NEXT_PUBLIC_ALLOW_MOCK_FALLBACK=true PLAYWRIGHT_MOCK_AUTH=true npm run dev -- --port 3002",
    url: "http://localhost:3002",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
