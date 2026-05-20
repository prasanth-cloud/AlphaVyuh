import { expect, test } from "@playwright/test";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

test.describe("Scan alerts unavailable state", () => {
  test.skip(process.env.NEXT_PUBLIC_FORCE_LIVE_DATA !== "true", "Requires forced-live API mode to exercise scan alert outage handling.");

  test("does not render alert service outages as empty saved scans", async ({ page }) => {
    await page.route(`${API}/api/v1/alerts`, (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Scan alerts are temporarily unavailable." }),
      })
    );
    await page.route(`${API}/api/v1/alerts/recent/matches`, (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Scan alerts are temporarily unavailable." }),
      })
    );

    await page.goto("/alerts");
    if (page.url().includes("/login")) return;

    await expect(page.getByTestId("scan-alerts-unavailable")).toContainText("Scan alerts are temporarily unavailable.", { timeout: 15_000 });
    await expect(page.getByText("Saved scan alerts unavailable")).toBeVisible();
    await expect(page.getByText("EOD digest unavailable")).toBeVisible();
    await expect(page.getByText("No saved scan alerts yet")).not.toBeVisible();
    await expect(page.getByText("No EOD matches yet")).not.toBeVisible();
  });
});
