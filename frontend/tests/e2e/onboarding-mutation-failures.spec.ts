import { expect, test } from "@playwright/test";

test.describe("Onboarding mutation failures", () => {
  test.skip(process.env.NEXT_PUBLIC_FORCE_LIVE_DATA !== "true", "Requires forced-live API mode to exercise failed onboarding writes.");

  test("does not complete onboarding when starter queue item adds fail", async ({ page }) => {
    let addRequests = 0;
    let profileUpdateRequests = 0;

    await page.route("**/api/v1/watchlists**", (route) => {
      const request = route.request();
      if (request.method() === "POST" && /\/api\/v1\/watchlists$/.test(new URL(request.url()).pathname)) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "onboarding-starter",
            name: "Starter setup queue",
            sort_order: 0,
            created_at: "2026-05-20T09:00:00Z",
            items: [],
          }),
        });
      }
      if (request.method() === "POST" && request.url().includes("/onboarding-starter/items")) {
        addRequests += 1;
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Watchlist add is temporarily unavailable." }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ watchlists: [] }),
      });
    });
    await page.route("**/api/v1/me", (route) => {
      if (route.request().method() === "PATCH") profileUpdateRequests += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "mock-user",
          email: "mock.qa@alphavyuh.local",
          full_name: "Mock QA",
          avatar_url: null,
          plan: "pro",
          plan_expires_at: null,
          onboarding_completed: true,
          telegram_chat_id: null,
          broker_type: null,
          broker_connected_at: null,
          billing_region: "IN",
          billing_currency: "INR",
          created_at: "2026-05-20T09:00:00Z",
        }),
      });
    });

    await page.goto("/onboarding");
    if (page.url().includes("/login")) return;

    await page.getByLabel(/Intermediate/).check();
    await page.getByLabel(/cash equities/i).check();
    await page.getByRole("button", { name: /Continue/i }).click();
    await page.getByRole("button", { name: /None yet/i }).click();
    await page.getByRole("button", { name: /Continue/i }).click();
    await page.getByRole("button", { name: /Starter queue/i }).click();

    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.getByText("Starter queue could not be completed. Watchlist add is temporarily unavailable.")).toBeVisible({ timeout: 15_000 });
    expect(addRequests).toBeGreaterThan(0);
    expect(profileUpdateRequests).toBe(0);
  });
});
