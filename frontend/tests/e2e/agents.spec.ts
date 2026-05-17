import { expect, test } from "@playwright/test";

test.describe("Agent mission control", () => {
  test("renders the founder agent operating view without runtime errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("response", (response) => {
      if (response.status() >= 500) errors.push(`${response.status()} ${response.url()}`);
    });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto("/agents", { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("agent-mission-control")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Mission control" })).toBeVisible();
    await expect(page.getByText("Agent operating system")).toBeVisible();
    await expect(page.getByText("PRs landed by agents")).toBeVisible();
    await expect(page.getByText("Owner and system gates")).toBeVisible();
    await expect(page.getByText("Waiting on another agent")).toBeVisible();
    await expect(page.getByText("Queue discipline")).toBeVisible();

    for (const agent of ["Manager", "Feature", "Data", "QA", "Deploy"]) {
      await expect(page.getByRole("heading", { name: agent })).toBeVisible();
    }

    await expect(page.getByRole("link", { name: "#125" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/SUPABASE_SERVICE_ROLE_KEY|KITE_ACCESS_TOKEN|UPSTOX_ACCESS_TOKEN/i);
    expect(errors.filter((entry) => !entry.includes("favicon"))).toEqual([]);
  });

  test("does not overflow on a narrow viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/agents", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("agent-mission-control")).toBeVisible({ timeout: 15_000 });

    const overflow = await page.evaluate(() => {
      const root = document.scrollingElement ?? document.documentElement;
      return root.scrollWidth - window.innerWidth;
    });
    expect(overflow).toBeLessThanOrEqual(2);
  });
});
