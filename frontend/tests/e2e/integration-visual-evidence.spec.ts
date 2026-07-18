import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { qaCredentials } from "./helpers/qaCredentials";

const { email, password } = qaCredentials();

async function login(page: Page) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
}

async function settleForEvidence(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({
    content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}",
  });
  await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => {});
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

async function attachScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
  locator?: Locator,
) {
  const path = testInfo.outputPath(`${name}.png`);
  if (locator) {
    await locator.screenshot({ path, animations: "disabled" });
  } else {
    await page.screenshot({ path, fullPage: true, animations: "disabled" });
  }
  await testInfo.attach(name, { path, contentType: "image/png" });
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return root.scrollWidth - window.innerWidth;
  });
  expect(overflow).toBeLessThanOrEqual(2);
}

test("captures the coherent integrated decision workflow", async ({ page }, testInfo) => {
  test.setTimeout(90_000);

  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await expect(page.getByTestId("dashboard-market-desk")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("dashboard-action-brief")).toBeVisible({ timeout: 15_000 });
  await settleForEvidence(page);
  await expectNoHorizontalOverflow(page);
  await attachScreenshot(page, testInfo, "dashboard-desktop");

  await page.goto("/analytics", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("market-pulse-provenance")).toBeVisible({ timeout: 15_000 });
  const marketPulseCharts = page.getByTestId("market-pulse-line-chart");
  await expect(marketPulseCharts).toHaveCount(2);
  await expect(marketPulseCharts.first()).toBeVisible({ timeout: 15_000 });
  await expect(marketPulseCharts.last()).toBeVisible({ timeout: 15_000 });
  await settleForEvidence(page);
  await expectNoHorizontalOverflow(page);
  await attachScreenshot(page, testInfo, "market-pulse-desktop");

  await page.goto("/journal", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("journal-review-queue")).toBeVisible({ timeout: 15_000 });
  const reviewedTrade = page.locator("tbody tr").filter({ hasText: "DIXON" });
  await expect(reviewedTrade).toHaveCount(1, { timeout: 15_000 });
  await reviewedTrade.click();
  const timeline = page.getByTestId("journal-review-timeline");
  await expect(timeline).toBeVisible({ timeout: 15_000 });
  await settleForEvidence(page);
  await attachScreenshot(page, testInfo, "journal-timeline-desktop", timeline);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("dashboard-market-desk")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("dashboard-action-brief")).toBeVisible({ timeout: 15_000 });
  await settleForEvidence(page);
  await expectNoHorizontalOverflow(page);
  await attachScreenshot(page, testInfo, "dashboard-mobile");

  await page.goto("/analytics", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("market-pulse-provenance")).toBeVisible({ timeout: 15_000 });
  await settleForEvidence(page);
  await expectNoHorizontalOverflow(page);
  await attachScreenshot(page, testInfo, "market-pulse-mobile");

  await page.goto("/journal", { waitUntil: "domcontentloaded" });
  const reviewQueue = page.getByTestId("journal-review-queue");
  await expect(reviewQueue).toBeVisible({ timeout: 15_000 });
  const mobileReviewedTrade = page.locator("tbody tr").filter({ hasText: "DIXON" });
  await expect(mobileReviewedTrade).toHaveCount(1, { timeout: 15_000 });
  await mobileReviewedTrade.click();
  const mobileTimeline = page.getByTestId("journal-review-timeline");
  await expect(mobileTimeline).toBeVisible({ timeout: 15_000 });
  await settleForEvidence(page);
  await expectNoHorizontalOverflow(page);
  await attachScreenshot(page, testInfo, "journal-timeline-mobile", mobileTimeline);
});
