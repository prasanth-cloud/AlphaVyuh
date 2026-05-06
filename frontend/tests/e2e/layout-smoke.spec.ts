import { expect, test, type Locator, type Page } from "@playwright/test";

type WorkflowPage = {
  path: string;
  name: string;
  marker: (page: Page) => Locator;
};

const pages: WorkflowPage[] = [
  { path: "/dashboard", name: "dashboard", marker: (page) => page.getByText("Market pulse") },
  { path: "/scanner", name: "scanner", marker: (page) => page.getByRole("button", { name: /^Run scan$/i }) },
  { path: "/watchlist", name: "watchlist", marker: (page) => page.getByText("Decision desk") },
  { path: "/charts/AUBANK?full=1", name: "full chart", marker: (page) => page.getByTestId("chart-drawing-overlay") },
  { path: "/journal", name: "journal", marker: (page) => page.getByText(/Review/i).first() },
];

const viewports = [
  { width: 1366, height: 768, label: "desktop" },
  { width: 1024, height: 768, label: "tablet" },
];

async function layoutProblems(page: Page) {
  return page.evaluate(() => {
    const problems: string[] = [];
    const root = document.scrollingElement ?? document.documentElement;
    if (root.scrollWidth > window.innerWidth + 2) {
      problems.push(`page horizontal overflow ${root.scrollWidth}px > ${window.innerWidth}px`);
    }

    const controls = Array.from(document.querySelectorAll("button, a"));
    for (const el of controls) {
      const node = el as HTMLElement;
      const rect = node.getBoundingClientRect();
      const text = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || rect.width < 1 || rect.height < 1) continue;
      const style = window.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (node.scrollWidth > node.clientWidth + 3 && style.overflowX === "hidden") {
        problems.push(`clipped ${node.tagName.toLowerCase()} "${text.slice(0, 60)}"`);
      }
    }
    return problems;
  });
}

test.describe("Workflow layout smoke", () => {
  for (const viewport of viewports) {
    test(`core workflow pages avoid horizontal overflow at ${viewport.label}`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      for (const workflowPage of pages) {
        await page.goto(workflowPage.path, { waitUntil: "domcontentloaded" });
        await expect(workflowPage.marker(page)).toBeVisible({ timeout: 15_000 });
        await page.waitForLoadState("networkidle", { timeout: 2_000 }).catch(() => {});
        const problems = await layoutProblems(page);
        expect(problems, `${workflowPage.name} ${viewport.label}`).toEqual([]);
      }
    });
  }
});
