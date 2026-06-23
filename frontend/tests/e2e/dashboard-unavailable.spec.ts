import { expect, test } from "@playwright/test";
import { qaCredentials } from "./helpers/qaCredentials";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

test.describe("Dashboard unavailable market data", () => {
  test("does not render an unavailable market overview as a healthy market pulse", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear());
    const { email, password } = qaCredentials();
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    await page.route(`${API}/api/v1/market/overview`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          trade_date: null,
          advances: 0,
          declines: 0,
          unchanged: 0,
          total: 0,
          market_phase: "Pending",
          sector_breadth: [],
          top_gainers: [],
          top_losers: [],
          most_active: [],
          mode: "unavailable",
          message: "Market summary is temporarily unavailable; dashboard will use the latest known shell data.",
        }),
      })
    );

    await page.goto("/dashboard");

    await expect(page.getByTestId("dashboard-sector-breadth-unavailable")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("dashboard-sector-breadth-unavailable")).toContainText("Sector breadth is temporarily unavailable");
    await expect(page.getByRole("link", { name: "Data status" })).toBeVisible();
    await expect(page.getByTestId("dashboard-data-trust")).not.toBeVisible();
  });
});
