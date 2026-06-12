import { expect, type Page } from "@playwright/test";

/** Select a popular screener preset, then run scan (scanner no longer auto-runs on load). */
export async function selectPresetAndRunScan(page: Page, presetName = "Trend Template") {
  await expect(page.getByText("Screeners", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  // Mock saved screens load in useEffect — proves scanner client hooks are hydrated.
  await expect(page.getByLabel(`Select saved screen ${presetName}`)).toBeVisible({ timeout: 15_000 });

  if (await page.getByTestId("scanner-data-trust").isVisible()) {
    return;
  }

  await page
    .locator(".workspace-section")
    .filter({ has: page.getByText("Screeners", { exact: true }) })
    .getByRole("button", { name: presetName, exact: true })
    .click();
  const runScanButton = page.getByRole("button", { name: /^Run scan$/i });
  await expect(runScanButton).toBeEnabled();
  await runScanButton.click();
  await expect(page.getByTestId("scanner-data-trust")).toBeVisible({ timeout: 20_000 });
}

export async function addScannerSymbolToWatchlist(page: Page, symbol: string, watchlistName: string) {
  const row = page
    .locator("tbody tr")
    .filter({ has: page.getByRole("button", { name: /^Shortlist$/ }) })
    .filter({ hasText: symbol })
    .first();
  await row.getByLabel(new RegExp(`More actions for ${symbol}`)).selectOption({ label: `Add to ${watchlistName}` });
}
