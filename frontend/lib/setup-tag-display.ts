/** Persist setup tags in lowercase for consistent analytics grouping. */
export function normalizeSetupTagForSave(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

/** Title Case display for setup tags in tables and analytics. */
export function formatSetupTagDisplay(value: string | null | undefined): string {
  if (!value?.trim()) return "—";
  return value
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
