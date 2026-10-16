import { expect, test } from "@playwright/test";

test.describe("Deployment and authentication reliability", () => {
  for (const query of [
    "symbol=RELIANCE&price=1500.50&change=2.25",
    "symbol=RELIANCE&change=Infinity",
    "symbol=RELIANCE&change=2.5garbage",
    "",
  ]) {
    test(`chart share image renders a complete PNG (${query || "missing values"})`, async ({ request }) => {
      const response = await request.get(`/api/og/chart?${query}`);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toContain("image/png");
      const png = await response.body();
      expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(png.toString("ascii", 12, 16)).toBe("IHDR");
      expect(png.readUInt32BE(16)).toBe(1200);
      expect(png.readUInt32BE(20)).toBe(630);
      expect(png.toString("ascii", png.length - 8, png.length - 4)).toBe("IEND");
    });
  }

  for (const endpoint of ["login", "signup", "resend-confirmation"]) {
    test(`${endpoint} rejects malformed JSON without setting a session`, async ({ request }) => {
      const response = await request.post(`/api/auth/${endpoint}`, {
        data: "{",
        headers: { "Content-Type": "application/json" },
      });
      expect(response.status()).toBe(400);
      expect(await response.json()).toEqual({ error: expect.any(String) });
      expect(response.headers()["set-cookie"]).toBeUndefined();
    });
  }

  test("provider outage leaves sign-in retryable without prompting a password reset", async ({ page }) => {
    const message = "Account access is temporarily unavailable while AlphaVyuh restores production service. No password change is needed.";
    await page.route("**/api/auth/login", (route) => route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: message }),
    }));
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill("qa@example.invalid");
    await page.getByLabel("Password", { exact: true }).fill("qa-not-a-real-password");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    const outageAlert = page.getByRole("alert").filter({ hasText: message });
    await expect(outageAlert).toBeVisible();
    await expect(outageAlert.getByRole("link", { name: "Reset password" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeEnabled();
    await expect(page).toHaveURL(/\/login$/);
  });
});
