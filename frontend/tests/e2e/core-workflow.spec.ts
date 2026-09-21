import { expect, test } from "@playwright/test";
import { selectPresetAndRunScan } from "./scanner-helpers";

test.describe("Core workflow — scanner → watchlist → chart → journal", () => {
  test("scan result flows through watchlist, chart, and journal", async ({ page }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    // 1. Run a momentum scan
    await page.goto("/scanner");
    await selectPresetAndRunScan(page, "Trend Template");

    const resultRows = page
      .locator("tbody tr")
      .filter({ has: page.getByRole("button", { name: /^Shortlist$/ }) });
    await expect(resultRows.first()).toBeVisible({ timeout: 10_000 });
    const symbol = (
      (await resultRows.first().locator(".mono").first().textContent()) ?? "RELIANCE"
    ).trim();

    // 2. Create a watchlist and shortlist the top result
    await resultRows.first().locator("input[type=checkbox]").check({ force: true });
    await page
      .locator(".scanner-results-toolbar")
      .getByRole("button", { name: /^Shortlist$/i })
      .click();
    await expect(resultRows.first().getByText("Shortlisted")).toBeVisible();

    await page.getByRole("button", { name: /Create watchlist/i }).first().click();
    await page.getByPlaceholder(/Watchlist name/).fill("Core Flow E2E");
    await page.getByRole("button", { name: /^Create$/ }).click();

    await expect(page).toHaveURL(/\/watchlist/, { timeout: 15_000 });
    await expect(page.getByText("Core Flow E2E").first()).toBeVisible();
    await expect(
      page.locator(".workspace-pill").filter({ hasText: `Focus: ${symbol}` }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // 3. Navigate to chart from watchlist
    await page.getByRole("button", { name: /^Full chart$/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`/charts/${symbol}`), { timeout: 15_000 });
    await expect(page.locator("body")).toContainText(symbol, { timeout: 15_000 });

    // 4. Place a mock order (creates journal draft)
    await page.getByRole("button", { name: "BUY", exact: true }).click();
    const orderModal = page.getByTestId("chart-order-modal");
    await orderModal.getByPlaceholder("Entry", { exact: true }).fill("1500");
    await orderModal.getByPlaceholder("Stop", { exact: true }).fill("1440");
    await orderModal.getByPlaceholder("Target", { exact: true }).fill("1650");
    await orderModal.getByPlaceholder("Qty", { exact: true }).fill("5");
    await orderModal.getByPlaceholder("Thesis", { exact: true }).fill("Core E2E test setup.");
    await orderModal
      .getByPlaceholder("Invalidation rule", { exact: true })
      .fill("Exit if base breaks on close.");

    await expect(
      page.getByRole("button", { name: /^Save buy journal draft$/i }),
    ).toBeEnabled({ timeout: 10_000 });
    await page.getByRole("button", { name: /^Save buy journal draft$/i }).click();
    await expect(page.getByText(/saved as a journal capture draft/i)).toBeVisible({
      timeout: 10_000,
    });

    // 5. Verify journal has the trade
    await page.goto("/journal");
    await expect(page.locator("body")).toContainText(symbol, { timeout: 15_000 });
    await page.locator("tbody tr").filter({ hasText: symbol }).first().click();
    await expect(page.getByTestId("journal-original-idea")).toContainText(
      /Original scan|Original thesis/i,
      { timeout: 10_000 },
    );

    // 6. Verify workflow state integrity
    const state = await page.evaluate((sym) => {
      const journal = JSON.parse(
        localStorage.getItem("alphavyuh-mock-journal-v1") || "[]",
      );
      const workflow = JSON.parse(
        localStorage.getItem("alphavyuh-workflow-state-v1") || "{}",
      );
      return {
        journal: journal.find(
          (entry: { symbol: string }) => entry.symbol === sym,
        ),
        workflow: workflow[sym],
      };
    }, symbol);

    expect(state.journal).toMatchObject({
      symbol,
      quantity: 5,
      status: "open",
    });
    expect(state.workflow).toMatchObject({
      lifecycle: "open",
      entry: 1500,
      stop: 1440,
      target: 1650,
      position_size: 5,
    });

    expect(errors).toEqual([]);
  });
});
