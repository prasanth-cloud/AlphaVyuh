import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const vercelShareStatePath = path.resolve(__dirname, "test-results/vercel-share-state.json");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  globalSetup: process.env.PLAYWRIGHT_ACCESS_URL ? "./tests/e2e/vercel-share-setup.ts" : undefined,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3001",
    storageState: process.env.PLAYWRIGHT_ACCESS_URL ? vercelShareStatePath : undefined,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
