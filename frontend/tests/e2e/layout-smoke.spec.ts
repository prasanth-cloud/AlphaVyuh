import { expect, test, type Locator, type Page } from "@playwright/test";

type WorkflowPage = {
  path: string;
  name: string;
  marker: (page: Page) => Locator;
};

const pages: WorkflowPage[] = [
  { path: "/dashboard", name: "dashboard", marker: (page) => page.getByTestId("dashboard-cockpit") },
  { path: "/scanner", name: "scanner", marker: (page) => page.getByRole("button", { name: /^Run scan$/i }) },
  { path: "/watchlist", name: "watchlist", marker: (page) => page.getByText("Decision desk") },
  { path: "/charts/AUBANK?full=1", name: "full chart", marker: (page) => page.getByTestId("chart-drawing-overlay") },
  { path: "/journal", name: "journal", marker: (page) => page.getByText(/Review/i).first() },
  { path: "/upload", name: "upload", marker: (page) => page.getByRole("heading", { name: "Upload trade report" }) },
  { path: "/agents", name: "agents", marker: (page) => page.getByTestId("agent-mission-control") },
];

const viewports = [
  { width: 1366, height: 768, label: "desktop" },
  { width: 1024, height: 768, label: "tablet" },
  { width: 390, height: 844, label: "mobile" },
];

const launchRoutes = [
  "/",
  "/beta",
  "/signup",
  "/login",
  "/reset-password",
  "/onboarding",
  "/dashboard",
  "/scanner",
  "/watchlist",
  "/charts/AUBANK?full=1",
  "/journal",
  "/upload",
  "/agents",
  "/settings",
  "/settings?tab=billing",
  "/settings/broker",
  "/data",
  "/privacy",
  "/terms",
  "/alerts",
  "/portfolio",
  "/options",
  "/community",
  "/offline",
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

async function themeProblems(page: Page, expected: "dark" | "light") {
  return page.evaluate(() => {
    const problems: string[] = [];
    const expectedTheme = (window as unknown as { __expectedTheme: "dark" | "light" }).__expectedTheme;
    if (document.documentElement.dataset.theme !== expectedTheme) {
      problems.push(`theme is ${document.documentElement.dataset.theme || "unset"}`);
    }

    const rgb = window.getComputedStyle(document.body).backgroundColor.match(/\d+/g)?.map(Number) ?? [];
    if (rgb.length >= 3) {
      const luminance = (0.2126 * rgb[0]) + (0.7152 * rgb[1]) + (0.0722 * rgb[2]);
      if (expectedTheme === "dark" && luminance > 55) problems.push(`body background is too light (${Math.round(luminance)})`);
      if (expectedTheme === "light" && luminance < 180) problems.push(`body background is too dark (${Math.round(luminance)})`);
    }

    if (expectedTheme === "light") return problems;

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
  }, expected);
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

  test("authenticated workflow defaults to the dark trading desk theme", async ({ page }) => {
    for (const workflowPage of pages) {
      await page.goto(workflowPage.path, { waitUntil: "domcontentloaded" });
      await expect(workflowPage.marker(page)).toBeVisible({ timeout: 15_000 });
      await page.evaluate(() => ((window as unknown as { __expectedTheme: "dark" | "light" }).__expectedTheme = "dark"));
      const problems = await themeProblems(page, "dark");
      expect(problems, workflowPage.name).toEqual([]);
    }
  });

  test("authenticated workflow respects the saved light theme", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("alphavyuh-theme", "light"));
    for (const workflowPage of pages) {
      await page.goto(workflowPage.path, { waitUntil: "domcontentloaded" });
      await expect(workflowPage.marker(page)).toBeVisible({ timeout: 15_000 });
      await page.evaluate(() => {
        window.localStorage.setItem("alphavyuh-theme", "light");
        document.documentElement.dataset.theme = "light";
        window.dispatchEvent(new CustomEvent("alphavyuh:theme-changed", { detail: "light" }));
      });
      await page.evaluate(() => ((window as unknown as { __expectedTheme: "dark" | "light" }).__expectedTheme = "light"));
      const problems = await themeProblems(page, "light");
      expect(problems, workflowPage.name).toEqual([]);
    }
  });

  test("scanner actions and watchlist chart header remain usable", async ({ page }) => {
    await page.goto("/scanner", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).not.toContainText("DISCOVERY");
    await expect(page.getByRole("button", { name: /Technicals/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Fundamentals/i })).toBeVisible();
    await page.getByRole("button", { name: /^Run scan$/i }).click();
    const firstRowActions = page.locator(".scanner-row-actions").first();
    await expect(firstRowActions).toBeVisible({ timeout: 20_000 });
    await expect(firstRowActions.getByRole("button", { name: "Shortlist" })).toBeVisible();
    await expect(firstRowActions.getByRole("combobox", { name: /Add .* to watchlist/i })).toBeVisible();
    await expect(firstRowActions.getByRole("button", { name: "Open chart" })).toBeVisible();
    await expect(firstRowActions.getByRole("button", { name: "Review later" })).toBeVisible();
    await expect(firstRowActions.getByRole("combobox", { name: /More actions/i })).toBeVisible();
    await expect(firstRowActions.getByRole("button")).toHaveCount(3);
    const primaryActionOrder = await firstRowActions.locator("button, select").evaluateAll((controls) =>
      controls.slice(0, 4).map((control) => {
        if (control instanceof HTMLSelectElement) return control.options[control.selectedIndex]?.textContent?.trim();
        return control.textContent?.trim();
      })
    );
    expect(primaryActionOrder).toEqual(["Shortlist", "Add to watchlist…", "Open chart", "Review later"]);
    await expect(page.locator("tbody tr").filter({ has: page.getByRole("button", { name: /^Shortlist$/ }) }).first()).toContainText(/A|B|C|D|\d{2,3}/);
    await page.locator("tbody tr").filter({ has: page.getByRole("button", { name: /^Shortlist$/ }) }).first().click();
    await expect(page.getByText("Why this matched")).toBeVisible();
    await expect(page.getByText("Next action")).toBeVisible();

    await page.goto("/watchlist", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Decision desk")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText("WORKSPACE");
    await expect(page.locator(".watchlist-chart-header")).toBeVisible();
    await expect(page.locator(".workspace-card-title").first().locator("span").first()).toBeVisible();
    await expect(page.getByTestId("decision-desk-nudges")).toBeVisible();

    const overlap = await page.locator(".watchlist-chart-header").evaluate((header) => {
      const children = Array.from(header.children).map((child) => child.getBoundingClientRect());
      return children.length >= 2 && children[0].x < children[1].x + children[1].width
        && children[0].x + children[0].width > children[1].x
        && children[0].y < children[1].y + children[1].height
        && children[0].y + children[0].height > children[1].y;
    });
    expect(overlap).toBe(false);
  });

  test("scanner can create a scan alert and the alerts center shows the digest", async ({ page }) => {
    await page.goto("/scanner", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /^Run scan$/i }).click();
    await expect(page.getByRole("button", { name: /^Add alert$/i })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /^Add alert$/i }).click();
    await expect(page.getByText("Create scan alert")).toBeVisible();
    await page.getByPlaceholder("Alert name…").fill("Launch QA scan");
    await page.getByRole("button", { name: /^Create$/i }).click();
    await expect(page.locator("body")).toContainText("Scan alert created", { timeout: 10_000 });

    await page.goto("/alerts", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Scan matches")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).toContainText("Launch QA scan");
    await expect(page.locator("body")).toContainText(/stocks matched on \d{4}-\d{2}-\d{2}/);
    await expect(page.locator("body")).not.toContainText(/Manage price alerts from the same trading desk/i);
    await expect(page.locator("body")).not.toContainText(/\b(buy|sell|recommended|act now)\b/i);
  });

  test("top search opens workflow commands", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("dashboard-cockpit")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".app-nav").getByRole("link")).toHaveText(["Dashboard", "Scanner", "Watchlist", "Journal"]);
    await page.keyboard.press("/");
    await page.getByPlaceholder("Search symbol or command...").fill("dashboard");
    await expect(page.locator(".app-float-panel").getByText("Open Dashboard", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.keyboard.press("/");
    await page.getByPlaceholder("Search symbol or command...").fill("journal");
    const commandPanel = page.locator(".app-float-panel");
    await expect(commandPanel.getByText("Review Journal", { exact: true })).toBeVisible();
    await commandPanel.getByText("Review Journal", { exact: true }).click();
    await expect(page).toHaveURL(/\/journal/);
    await expect(page.getByTestId("journal-review-queue")).toBeVisible({ timeout: 15_000 });
  });

  test("requested workspace copy and reminder strip are removed", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).not.toContainText(/Market command center/i);
    await expect(page.locator("body")).not.toContainText(/Scan the latest context/i);
    await expect(page.locator("body")).not.toContainText(/Continue your workflow/i);
    await expect(page.getByRole("button", { name: /Data status/i })).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("UNKNOWN");
    await expect(page.locator(".reminder-strip-shell")).toHaveCount(0);

    await page.goto("/scanner", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).not.toContainText("DISCOVERY");
    await expect(page.locator("body")).not.toContainText(/Start from presets/i);
    await expect(page.locator(".reminder-strip-shell")).toHaveCount(0);

    await page.goto("/watchlist", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).not.toContainText("WORKSPACE");
    await expect(page.locator("body")).not.toContainText(/chart, plan, and order intent stay focused/i);
    await expect(page.locator(".reminder-strip-shell")).toHaveCount(0);
  });

  test("login page uses simplified account-access copy", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("alphavyuh-theme", "light"));
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.getByText("Sign in to AlphaVyuh")).toBeVisible();
    await expect(page.locator("body")).toContainText(/EOD market data/i);
    await expect(page.locator("body")).toContainText(/Broker import only/i);
    await expect(page.locator("body")).not.toContainText(/Professional Access/i);
    await expect(page.locator("body")).not.toContainText(/Launch Surface/i);
    await expect(page.locator("body")).not.toContainText(/Build a trading workflow/i);
  });

  test("watchlist chart timeframe switching exposes range and source context", async ({ page }) => {
    await page.goto("/watchlist", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Decision desk")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".watchlist-chart-header")).toContainText(/3M · Daily · \d{4}-\d{2}-\d{2}/, { timeout: 15_000 });

    await page.locator(".watchlist-chart-header .chart-timeframe-dropdown summary").click();
    await expect(page.locator(".watchlist-chart-header").getByRole("button", { name: "5m", exact: true })).toHaveAttribute("aria-disabled", "true");
    await page.locator(".watchlist-chart-header").getByRole("button", { name: "5m", exact: true }).click({ force: true });
    await expect(page.locator(".watchlist-chart-header")).toContainText(/Intraday data is not available on the EOD data plan yet/i);
    await page.locator(".watchlist-chart-header").getByRole("button", { name: "1Y" }).click();
    await expect(page.locator(".watchlist-chart-header")).toContainText(/1Y · Daily · \d{4}-\d{2}-\d{2}/, { timeout: 15_000 });
    await expect(page.locator(".watchlist-chart-header")).toContainText(/Data as of \d{4}-\d{2}-\d{2}/i);
    await expect(page.locator(".watchlist-chart-header")).toContainText(/\d+ bars/i);

    await page.locator(".watchlist-chart-header").getByRole("button", { name: "Max", exact: true }).click();
    await expect(page.locator(".watchlist-chart-header")).toContainText(/Max · Monthly · \d{4}-\d{2}-\d{2}/, { timeout: 15_000 });

    await page.locator(".watchlist-chart-header .chart-timeframe-dropdown summary").click();
    await page.locator(".watchlist-chart-header").getByText(/SMA|Indicators/).first().click();
    await expect(page.locator(".watchlist-chart-header").getByRole("button", { name: /EMA\(20\)|EMA 20/i })).toBeVisible();
    await expect(page.locator(".watchlist-chart-header").getByRole("button", { name: /Bollinger/i })).toBeVisible();
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

  test("launch routes render without console errors or horizontal overflow", async ({ page }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    for (const route of launchRoutes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toBeVisible({ timeout: 15_000 });
      await page.waitForLoadState("networkidle", { timeout: 2_000 }).catch(() => {});
      expect(await layoutProblems(page), route).toEqual([]);
    }

    expect(errors.filter((entry) => !entry.includes("favicon")), "console/page errors").toEqual([]);
  });

  test("billing launch posture blocks checkout until production payments are configured", async ({ page }) => {
    await page.goto("/settings?tab=billing", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("billing-launch-posture")).toContainText(/Billing is not enabled for this account|Production billing ready/i, { timeout: 15_000 });

    const posture = await page.getByTestId("billing-launch-posture").textContent();
    if (posture?.includes("Billing is not enabled for this account")) {
      await expect(page.getByRole("button", { name: "Checkout disabled" }).first()).toBeDisabled();
      await expect(page.locator("body")).toContainText(/Account Access/i);
      await expect(page.locator("body")).not.toContainText(/FOUNDER/i);
      await expect(page.getByLabel("Access code")).toHaveAttribute("placeholder", "ACCESS CODE");
    }

    expect(await layoutProblems(page)).toEqual([]);
  });

  test("account access labels and no-execution posture are visible", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(/Account access/i);
    await expect(page.locator("body")).toContainText(/EOD market data/i);
    await expect(page.locator("body")).toContainText(/Broker import only/i);
    await expect(page.locator("body")).toContainText(/not investment advice/i);
    await expect(page.locator("body")).toContainText(/Billing is enabled|Checkout opens|No production Razorpay payment/i);
    await expect(page.locator("body")).not.toContainText(/Professional Access/i);

    await page.goto("/access", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(/Trading workflow/i);
    await expect(page.locator("body")).toContainText(/Market data/i);
    await expect(page.locator("body")).toContainText(/Broker read-only|filled-trade import/i);
    await expect(page.locator("body")).toContainText(/not investment advice/i);
    await expect(page.locator("body")).toContainText(/Checkout opens|Production Razorpay checkout opens/i);
    await expect(page.locator("body")).toContainText(/support@alphavyuh\.com/i);
    await expect(page.locator("body")).toContainText(/Data and execution policy/i);

    await page.goto("/onboarding", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(/Account-managed access|Account access/i, { timeout: 15_000 });
    await expect(page.locator("body")).toContainText(/Market data/i);
    await expect(page.locator("body")).toContainText(/Execution not enabled yet/i);
    await expect(page.locator("body")).toContainText(/NSE\/BSE cash equities/i);
    await expect(page.locator("body")).not.toContainText(/F&O|futures & options|Greeks|OI dashboards/i);

    await page.goto("/settings/broker", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(/read-only|import only/i, { timeout: 15_000 });
    await expect(page.locator("body")).toContainText(/Live and sandbox order (placement|submission) (are|is) not enabled yet/i);
  });

  test("customer-facing routes avoid legacy beta posture copy", async ({ page }) => {
    const routes = [
      "/",
      "/signup",
      "/login",
      "/reset-password",
      "/onboarding",
      "/dashboard",
      "/scanner",
      "/watchlist",
      "/charts/AUBANK?full=1",
      "/journal",
      "/upload",
      "/settings",
      "/settings?tab=billing",
      "/settings/broker",
      "/data",
      "/privacy",
      "/terms",
      "/access",
      "/beta",
    ];
    const forbidden = /\b(private beta|founder beta|market beta|beta access|beta guide|join beta|beta waitlist|waitlist-gated|known beta limitations|beta onboarding checklist)\b/i;

    for (const route of routes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      const text = await page.locator("body").innerText({ timeout: 15_000 });
      expect(text, route).not.toMatch(forbidden);
    }
  });
});
