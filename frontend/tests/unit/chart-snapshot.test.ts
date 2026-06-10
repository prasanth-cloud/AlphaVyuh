import { describe, expect, it } from "vitest";

import { buildChartSnapshotMetadata } from "@/lib/chart-snapshot";

describe("chart snapshot metadata", () => {
  it("captures a lightweight chart entry reference for journal rows", () => {
    const snapshot = buildChartSnapshotMetadata("reliance", 2850.5);

    expect(snapshot.symbol).toBe("RELIANCE");
    expect(snapshot.chart_url).toBe("/charts/RELIANCE?full=1");
    expect(snapshot.entry_price).toBe(2850.5);
    expect(snapshot.captured_at).toBeTruthy();
  });
});
