import type { DataHealth, MarketOverview } from "@/lib/api/types";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function formatIstDateTime(date: Date): string {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const day = ist.getUTCDate();
  const suffix = day % 10 === 1 && day !== 11 ? "st"
    : day % 10 === 2 && day !== 12 ? "nd"
    : day % 10 === 3 && day !== 13 ? "rd"
    : "th";
  const month = ist.toLocaleString("en-IN", { month: "short", timeZone: "UTC" });
  const year = ist.getUTCFullYear();
  const hours = ist.getUTCHours();
  const minutes = ist.getUTCMinutes().toString().padStart(2, "0");
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const ampm = hours >= 12 ? "PM" : "AM";
  return `${day}${suffix} ${month} ${year}, ${hour12}:${minutes} ${ampm} IST`;
}

/** Best-effort last EOD sync label for dashboard trust copy. */
export function formatLastEodUpdated(health: DataHealth | null | undefined, overview?: MarketOverview | null): string | null {
  if (health?.hours_since_refresh != null && Number.isFinite(health.hours_since_refresh)) {
    const syncedAt = new Date(Date.now() - health.hours_since_refresh * 3600 * 1000);
    return formatIstDateTime(syncedAt);
  }
  if (overview?.generated_at) {
    const parsed = new Date(overview.generated_at);
    if (!Number.isNaN(parsed.getTime())) return formatIstDateTime(parsed);
  }
  return null;
}
