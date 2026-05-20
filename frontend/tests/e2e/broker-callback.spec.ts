import { expect, test } from "@playwright/test";

test.describe("Broker OAuth callback", () => {
  test("shows broker denial without exchanging an OAuth code", async ({ page }) => {
    let callbackRequests = 0;
    await page.route(/\/api\/v1\/broker\/(zerodha|upstox)\/callback/, (route) => {
      callbackRequests += 1;
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Callback exchange should not run" }),
      });
    });

    await page.goto("/broker/callback?broker=upstox&error=access_denied&error_description=User%20denied%20access&state=oauth-state");

    await expect(page.getByTestId("broker-callback-error")).toContainText("Connection failed");
    await expect(page.getByTestId("broker-callback-message")).toContainText("Upstox authorization was not completed: User denied access");
    await expect(page.getByTestId("broker-callback-back")).toBeVisible();
    expect(callbackRequests).toBe(0);
  });

  test("rejects unsupported broker callbacks before exchange", async ({ page }) => {
    let callbackRequests = 0;
    await page.route(/\/api\/v1\/broker\/(zerodha|upstox)\/callback/, (route) => {
      callbackRequests += 1;
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Callback exchange should not run" }),
      });
    });

    await page.goto("/broker/callback?broker=unknown&code=broker-code&state=oauth-state");

    await expect(page.getByTestId("broker-callback-error")).toContainText("Connection failed");
    await expect(page.getByTestId("broker-callback-message")).toContainText("Unsupported broker callback");
    await expect(page.getByTestId("broker-callback-back")).toBeVisible();
    expect(callbackRequests).toBe(0);
  });
});
