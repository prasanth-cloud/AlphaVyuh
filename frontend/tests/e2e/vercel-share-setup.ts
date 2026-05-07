import { chromium } from "@playwright/test";
import path from "node:path";

export default async function vercelShareSetup() {
  const accessUrl = process.env.PLAYWRIGHT_ACCESS_URL;
  if (!accessUrl) return;

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(accessUrl, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
  await context.storageState({ path: path.resolve(__dirname, "../../test-results/vercel-share-state.json") });
  await browser.close();
}
