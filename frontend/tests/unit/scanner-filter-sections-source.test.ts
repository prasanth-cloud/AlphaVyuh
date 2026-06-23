import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const scannerSource = readFileSync("app/(app)/scanner/page.tsx", "utf8");

describe("scanner filter sections UX", () => {
  it("collapses filter sections by default with localStorage persistence", () => {
    expect(scannerSource).toContain("function FilterSection");
    expect(scannerSource).toContain("readScannerFilterSectionOpen");
    expect(scannerSource).toContain("writeScannerFilterSectionOpen");
    expect(scannerSource).not.toContain('<Section title="Price and change" open>');
    expect(scannerSource).not.toContain('<Section title="Trend quality" open>');
  });

  it("shows scan match context and history tooltip copy", () => {
    expect(scannerSource).toContain("pre-filtered symbols");
    expect(scannerSource).toContain("View past scan results for this preset");
    expect(scannerSource).toContain("No past scans saved yet. Run a scan to record results.");
  });
});
