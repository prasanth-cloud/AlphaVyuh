import { expect, type Page } from "@playwright/test";

/** Select a popular screener preset, then run scan (scanner no longer auto-runs on load). */
export async function selectPresetAndRunScan(page: Page, presetName = "Trend Template") {
  await page.getByRole("button", { name: presetName, exact: true }).click();
  await page.getByRole("button", { name: /^Run scan$/i }).click();
  await expect(page.getByRole("button", { name: /Create watchlist/i }).first()).toBeVisible({ timeout: 20_000 });
}
