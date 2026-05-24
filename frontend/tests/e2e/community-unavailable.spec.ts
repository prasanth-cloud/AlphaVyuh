import { expect, test } from "@playwright/test";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

test.describe("Community screens unavailable state", () => {
  test("does not render shared screen outages as an empty community", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("alphavyuh-e2e-route-mocks", "true");
    });
    await page.route(`${API}/api/v1/community/screens**`, (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Community screens are temporarily unavailable." }),
      }),
    );

    await page.goto("/community");

    await expect(page.getByTestId("community-screens-unavailable")).toContainText("Community screens unavailable", { timeout: 15_000 });
    await expect(page.getByTestId("community-screens-unavailable")).toContainText("Community screens are temporarily unavailable.");
    await expect(page.getByTestId("community-screens-unavailable")).toContainText("not being treated as empty");
    await expect(page.getByText("No shared screens yet")).not.toBeVisible();
  });
});
