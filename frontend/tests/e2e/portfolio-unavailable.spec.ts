import { expect, test } from "@playwright/test";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

test.describe("Portfolio unavailable state", () => {
  test.skip(process.env.NEXT_PUBLIC_FORCE_LIVE_DATA !== "true", "Requires forced-live API mode to exercise portfolio outage handling.");

  test("does not render portfolio outages as no open positions", async ({ page }) => {
    await page.route(`${API}/api/v1/journal/portfolio`, (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Portfolio is temporarily unavailable." }),
      })
    );

    await page.goto("/portfolio");
    if (page.url().includes("/login")) return;

    await expect(page.getByTestId("portfolio-unavailable")).toContainText("Portfolio is temporarily unavailable.", { timeout: 15_000 });
    await expect(page.getByText("Open positions are not being treated as empty")).toBeVisible();
    await expect(page.getByText("No open positions")).not.toBeVisible();
  });
});
