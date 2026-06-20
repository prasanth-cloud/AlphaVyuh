import { test, expect } from "@playwright/test";
import { qaCredentials } from "./helpers/qaCredentials";

const ACCESS_URL = process.env.PLAYWRIGHT_ACCESS_URL;
const { email: EMAIL, password: PASSWORD } = qaCredentials();

async function login(page: import("@playwright/test").Page) {
  await page.context().clearCookies();
  if (ACCESS_URL) await page.goto(ACCESS_URL);
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });
}

test.describe("Chart page load", () => {
  test("chart container is visible and non-empty within 600ms", async ({ page }) => {
    await login(page);
    const start = Date.now();
    await page.goto("/charts/RELIANCE");
    await expect(page.getByTestId("chart-symbol-ticker")).toBeVisible({ timeout: 600 });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(10000);
  });

  test("log trade button is visible in chart toolbar", async ({ page }) => {
    await login(page);
    await page.goto("/charts/RELIANCE");
    await expect(page.getByTitle("Log a trade for this symbol")).toBeVisible({ timeout: 15000 });
  });

  test("D/W/M timeframe pills are visible", async ({ page }) => {
    await login(page);
    await page.goto("/charts/RELIANCE");
    await expect(page.getByRole("button", { name: "D" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: "W" })).toBeVisible();
    await expect(page.getByRole("button", { name: "M" })).toBeVisible();
  });
});
