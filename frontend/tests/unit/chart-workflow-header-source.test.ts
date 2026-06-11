import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const headerSource = readFileSync(
  resolve(process.cwd(), "components/ChartWorkflowHeader.tsx"),
  "utf8",
);

describe("ChartWorkflowHeader source", () => {
  it("uses canonical chart workflow copy and next-step test id", () => {
    expect(headerSource).toContain("TRADER_WORKFLOW_STEPS[3].body");
    expect(headerSource).toContain('data-testid="chart-workflow-header"');
    expect(headerSource).toContain('data-testid="workflow-desk-next"');
    expect(headerSource).toContain("getChartWorkflowLinks");
    expect(headerSource).toContain("Next:");
  });
});
