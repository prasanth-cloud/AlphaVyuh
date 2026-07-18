import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const specSource = readFileSync("tests/e2e/integration-visual-evidence.spec.ts", "utf8");
const workflowSource = readFileSync("../.github/workflows/agent-pr-gate.yml", "utf8");

describe("integrated visual evidence contract", () => {
  it("captures the three integrated product surfaces at desktop and mobile sizes", () => {
    expect(specSource).toContain('"dashboard-desktop"');
    expect(specSource).toContain('"market-pulse-desktop"');
    expect(specSource).toContain('"journal-timeline-desktop"');
    expect(specSource).toContain('"dashboard-mobile"');
    expect(specSource).toContain('"market-pulse-mobile"');
    expect(specSource).toContain('"journal-timeline-mobile"');
    expect(specSource).toContain('filter({ hasText: "DIXON" })');
    expect(specSource).toContain("toHaveCount(2)");
    expect(specSource).toContain("expectNoHorizontalOverflow");
    expect(specSource).toContain("expectNoInnerHorizontalOverflow(mobileSectorTable)");
    expect(specSource).toContain('reducedMotion: "reduce"');
  });

  it("runs in the PR gate and preserves the screenshots as a review artifact", () => {
    expect(workflowSource).toContain("Capture integrated visual evidence");
    expect(workflowSource).toContain("frontend/tests/e2e/integration-visual-evidence.spec.ts");
    expect(workflowSource).toContain("actions/upload-artifact@v7");
    expect(workflowSource).toContain("frontend/test-results/**/*.png");
    expect(workflowSource).toContain("if-no-files-found: ignore");
    expect(workflowSource).toContain("retention-days: 14");
  });
});
