import { describe, expect, it } from "vitest";
import { buildChartDrawingMeasurement } from "@/lib/chart-drawing-measure";

describe("chart drawing measurement", () => {
  it("measures a trendline price move and session span", () => {
    expect(buildChartDrawingMeasurement({
      tool: "Trendline",
      p1: { time: "2026-05-01", price: 100 },
      p2: { time: "2026-05-11", price: 112.5 },
    })).toEqual({
      primary: "Move +₹12.50 (+12.50%)",
      secondary: "10 days · ₹100.00 to ₹112.50",
    });
  });

  it("measures horizontal levels against the latest close", () => {
    expect(buildChartDrawingMeasurement({
      tool: "Horizontal",
      p1: { time: "2026-05-01", price: 120 },
      p2: { time: "2026-05-10", price: 120 },
    }, { referencePrice: 100 })).toEqual({
      primary: "Level ₹120.00",
      secondary: "20.00% above last price",
    });
  });

  it("measures rectangle zone height", () => {
    expect(buildChartDrawingMeasurement({
      tool: "Rectangle",
      p1: { time: "2026-05-01", price: 110 },
      p2: { time: "2026-05-06", price: 100 },
    })).toEqual({
      primary: "Zone ₹100.00-₹110.00",
      secondary: "Height 9.52% · 5 days",
    });
  });

  it("measures long position risk reward", () => {
    expect(buildChartDrawingMeasurement({
      tool: "LongPosition",
      p1: { time: "2026-05-01", price: 100 },
      p2: { time: "2026-05-02", price: 95 },
      p3: { time: "2026-05-02", price: 112.5 },
    })).toEqual({
      primary: "Entry ₹100.00 · Stop ₹95.00 · Target ₹112.50",
      secondary: "Risk 5.00% · Reward 12.50% · R:R 2.50",
    });
  });
});
