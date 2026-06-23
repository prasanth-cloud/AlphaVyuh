import { describe, expect, it } from "vitest";
import {
  PRESETS_VISIBLE_PER_GROUP,
  SCREENER_CATEGORIES,
  togglePresetGroupExpanded,
} from "@/lib/scanner-preset-groups";

describe("scanner preset groups", () => {
  it("groups built-in presets under trend, breakout, and event", () => {
    expect(SCREENER_CATEGORIES.map((category) => category.id)).toEqual([
      "trend",
      "breakout",
      "event",
    ]);
    expect(SCREENER_CATEGORIES[0].presetIds).toContain("trend_template");
    expect(SCREENER_CATEGORIES[1].presetIds).toContain("vcp_breakout");
    expect(SCREENER_CATEGORIES[2].presetIds).toContain("episodic_pivot");
  });

  it("shows three presets per group before expanding", () => {
    expect(PRESETS_VISIBLE_PER_GROUP).toBe(3);
  });

  it("toggles expanded preset groups", () => {
    const expanded = togglePresetGroupExpanded(new Set(), "breakout");
    expect(expanded.has("breakout")).toBe(true);
    expect(togglePresetGroupExpanded(expanded, "breakout").has("breakout")).toBe(false);
  });
});
