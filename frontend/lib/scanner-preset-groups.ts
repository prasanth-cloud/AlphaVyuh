export type ScreenerCategoryId = "trend" | "breakout" | "event";

export type ScreenerCategory = {
  id: ScreenerCategoryId;
  label: string;
  presetIds: readonly string[];
};

/** Built-in screener presets grouped for the filter rail. */
export const SCREENER_CATEGORIES: ScreenerCategory[] = [
  {
    id: "trend",
    label: "Trend",
    presetIds: ["trend_template", "stage2_breakout"],
  },
  {
    id: "breakout",
    label: "Breakout",
    presetIds: [
      "vcp_breakout",
      "high_52w_breakout",
      "darvas_box_breakout",
      "low_52w_breakout",
    ],
  },
  {
    id: "event",
    label: "Event",
    presetIds: ["episodic_pivot"],
  },
];

export const PRESETS_VISIBLE_PER_GROUP = 3;

export function togglePresetGroupExpanded(
  expanded: Set<ScreenerCategoryId>,
  categoryId: ScreenerCategoryId,
): Set<ScreenerCategoryId> {
  const next = new Set(expanded);
  if (next.has(categoryId)) next.delete(categoryId);
  else next.add(categoryId);
  return next;
}
