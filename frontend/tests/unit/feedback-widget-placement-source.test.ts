import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shell = readFileSync(new URL("../../components/AppShell.tsx", import.meta.url), "utf8");
const widget = readFileSync(new URL("../../components/FeedbackWidget.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

describe("feedback widget placement", () => {
  it("keeps contextual feedback in the existing toolbar instead of covering workspace content", () => {
    expect(shell).toContain("<AccountMenuButton theme={theme} onToggleTheme={toggleTheme} />\n            {!hideFeedback && <FeedbackWidget />}");
    expect(shell).not.toContain("</main>\n      {!hideFeedback && <FeedbackWidget />}");
    expect(shell).toContain("const hideFeedback = fullChart || pathname.startsWith('/broker/callback')");
    expect(styles).toContain(".feedback-widget {\n  position: relative;");
    expect(styles).toContain(".feedback-widget-panel {\n  position: absolute;");
    expect(styles).toContain("width: min(320px, calc(100vw - 32px));");
    expect(shell).toContain("alphavyuh:utility-popover-open");
    expect(widget).toContain("UTILITY_POPOVER_EVENT");
    expect(widget).toContain("closeAndRestoreFocus");
    expect(widget).toContain('role="status" aria-live="polite"');
  });
});
