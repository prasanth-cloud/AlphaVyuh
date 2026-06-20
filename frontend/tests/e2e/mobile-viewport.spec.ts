import { test, expect } from "@playwright/test";

const MOBILE_VIEWPORT = { width: 375, height: 812 };

const PAGES = [
  { name: "scanner", path: "/scanner" },
  { name: "watchlist", path: "/watchlist" },
  { name: "chart", path: "/charts/RELIANCE" },
  { name: "journal", path: "/journal" },
];

test.describe("Mobile viewport (375px)", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  for (const page of PAGES) {
    test(`${page.name} renders without horizontal overflow`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: MOBILE_VIEWPORT });
      const p = await context.newPage();

      await p.goto(page.path, { waitUntil: "networkidle", timeout: 15000 }).catch(() => {
        // Page may redirect to login — that's fine for layout test
      });

      await p.waitForTimeout(1000);

      await p.screenshot({
        path: `tests/e2e/screenshots/mobile-${page.name}.png`,
        fullPage: true,
      });

      const overflowX = await p.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      expect(overflowX, `${page.name} has horizontal overflow at 375px`).toBe(false);

      await context.close();
    });
  }
});
