import { expect, test } from "@playwright/test";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

test.describe("Scanner unavailable payloads", () => {
  test("does not render a service outage as a zero-result scan", async ({ page }) => {
    await page.route(`${API}/api/v1/scanner/screens`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ screens: [] }),
      })
    );
    await page.route(`${API}/api/v1/scanner/run`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          trade_date: null,
          total_matches: 0,
          results: [],
          mode: "unavailable",
          message: "Scanner data is temporarily unavailable.",
        }),
      })
    );

    await page.goto("/scanner");
    if (page.url().includes("/login")) return;

    await expect(page.getByText("Scanner data is temporarily unavailable.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("No stocks matched")).not.toBeVisible();
  });
});
