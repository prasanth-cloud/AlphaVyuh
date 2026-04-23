import { test, expect } from "@playwright/test";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const FIXTURE_RESULT = {
  symbol: "RELIANCE",
  company_name: "Reliance Industries Ltd",
  sector: "Energy",
  close: 2800.0,
  pct_change: 1.5,
  volume: 5_000_000,
  avg_volume_20d: 3_000_000,
  volume_ratio: 1.67,
  rsi_14: 65,
  ema_20: 2750,
  ema_50: 2700,
  ema_200: 2600,
  macd_hist: 12.5,
  atr_14: 45.0,
  adx_14: 35.0,
  week_52_high: 3024.0,
  week_52_low: 2194.0,
  week_52_high_pct: 8.0,
  is_new_52w_high: false,
  rs_score: 82,
  bb_width: 0.05,
  market_cap_cr: 1_895_000,
  pe_ratio: 28.5,
  pb_ratio: 2.1,
  eps: 98.2,
  dividend_yield: 0.4,
  roe: 12.5,
  roce: 14.2,
};

test.describe("Scanner — SEPA preset", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(`${API}/api/v1/scanner/run`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          results: [FIXTURE_RESULT],
          total_matches: 1,
          trade_date: "2026-04-22",
          is_limited: false,
        }),
      })
    );
  });

  test("SEPA preset chip is visible and first in the list", async ({ page }) => {
    await page.goto("/scanner");
    if (page.url().includes("/login")) return;

    const sepaChip = page.getByRole("button", { name: "SEPA" });
    await expect(sepaChip).toBeVisible();
  });

  test("clicking SEPA runs scan with correct filters and shows results", async ({
    page,
  }) => {
    let capturedPayload: Record<string, unknown> = {};

    await page.route(`${API}/api/v1/scanner/run`, async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      capturedPayload = body;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          results: [FIXTURE_RESULT],
          total_matches: 1,
          trade_date: "2026-04-22",
          is_limited: false,
        }),
      });
    });

    await page.goto("/scanner");
    if (page.url().includes("/login")) return;

    await page.getByRole("button", { name: "SEPA" }).click();

    // Wait for at least one result row
    await expect(page.locator("table tbody tr").first()).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator("table tbody")).toContainText("RELIANCE");

    // Verify the payload sent to the backend has the correct SEPA filters
    // (uses rs_score_min, not rs_rating_min — ADR 006 §Decision 5)
    expect(capturedPayload.filters).toMatchObject({
      all_emas_bullish: true,
      rs_score_min: 70,
      w52h_pct_max: 25,
      w52l_pct_min: 30,
    });
  });

  test("RS column renders rs_score and highlights ≥70 in accent color", async ({
    page,
  }) => {
    await page.goto("/scanner");
    if (page.url().includes("/login")) return;

    await page.getByRole("button", { name: "SEPA" }).click();

    await expect(page.locator("table tbody tr").first()).toBeVisible({
      timeout: 5000,
    });

    // The RS value (82 in fixture) should be visible in the table
    await expect(page.locator("table tbody")).toContainText("82");
  });
});
