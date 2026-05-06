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
  { width: 390, height: 844, label: "mobile" },
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

async function darkThemeProblems(page: Page) {
  return page.evaluate(() => {
    const problems: string[] = [];
    if (document.documentElement.dataset.theme !== "dark") {
      problems.push(`theme is ${document.documentElement.dataset.theme || "unset"}`);
    }

    const rgb = window.getComputedStyle(document.body).backgroundColor.match(/\d+/g)?.map(Number) ?? [];
    if (rgb.length >= 3) {
      const luminance = (0.2126 * rgb[0]) + (0.7152 * rgb[1]) + (0.0722 * rgb[2]);
      if (luminance > 55) problems.push(`body background is too light (${Math.round(luminance)})`);
    }

    const lightPanels = Array.from(document.querySelectorAll(".app-shell .workspace-card, .app-shell .workspace-hero, .app-shell table, .app-shell aside"))
      .filter((el) => {
        const color = window.getComputedStyle(el as HTMLElement).backgroundColor;
        const parts = color.match(/[\d.]+/g)?.map(Number) ?? [];
        if (parts.length < 3) return false;
        const alpha = parts[3] ?? 1;
        if (alpha < 0.65) return false;
        const luminance = (0.2126 * parts[0]) + (0.7152 * parts[1]) + (0.0722 * parts[2]);
        return luminance > 80;
      });
    if (lightPanels.length) problems.push(`${lightPanels.length} workflow panels rendered light`);

    return problems;
  });
}

function intersects(a: DOMRect | { x: number; y: number; width: number; height: number }, b: DOMRect | { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
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

  test("authenticated workflow stays in the dark trading desk theme", async ({ page }) => {
    for (const workflowPage of pages) {
      await page.goto(workflowPage.path, { waitUntil: "domcontentloaded" });
      await expect(workflowPage.marker(page)).toBeVisible({ timeout: 15_000 });
      const problems = await darkThemeProblems(page);
      expect(problems, workflowPage.name).toEqual([]);
    }
  });

  test("scanner actions and watchlist chart header remain usable", async ({ page }) => {
    await page.goto("/scanner", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /^Run scan$/i }).click();
    await expect(page.locator(".scanner-row-actions").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".scanner-row-actions").first().getByRole("button", { name: "Shortlist" })).toBeVisible();
    await expect(page.locator(".scanner-row-actions").first().getByRole("button", { name: "Chart" })).toBeVisible();

    await page.goto("/watchlist", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Decision desk")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".watchlist-chart-header")).toBeVisible();

    const overlap = await page.locator(".watchlist-chart-header").evaluate((header) => {
      const children = Array.from(header.children).map((child) => child.getBoundingClientRect());
      return children.length >= 2 && children[0].x < children[1].x + children[1].width
        && children[0].x + children[0].width > children[1].x
        && children[0].y < children[1].y + children[1].height
        && children[0].y + children[0].height > children[1].y;
    });
    expect(overlap).toBe(false);
  });

  test("feedback widget does not cover top workflow controls", async ({ page }) => {
    await page.goto("/watchlist", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Decision desk")).toBeVisible({ timeout: 15_000 });
    const boxes = await page.evaluate(() => {
      const serialize = (rect: DOMRect | undefined) => rect ? {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      } : null;
      const widget = serialize(document.querySelector(".feedback-widget")?.getBoundingClientRect());
      const topbar = serialize(document.querySelector(".app-topbar")?.getBoundingClientRect());
      const chartHeader = serialize(document.querySelector(".watchlist-chart-header")?.getBoundingClientRect());
      return { widget, topbar, chartHeader };
    });

    expect(boxes.widget).toBeTruthy();
    if (boxes.widget && boxes.topbar) expect(intersects(boxes.widget, boxes.topbar)).toBe(false);
    if (boxes.widget && boxes.chartHeader) expect(intersects(boxes.widget, boxes.chartHeader)).toBe(false);
  });
});
