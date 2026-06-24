export type JournalDayPnl = {
  date: string;
  pnl: number;
  trades: number;
};

type JournalExitRow = {
  status: string;
  exit_date: string | null;
  pnl: number | null;
};

export function buildJournalDailyPnl(entries: JournalExitRow[]): JournalDayPnl[] {
  const byDate = new Map<string, { pnl: number; trades: number }>();
  for (const entry of entries) {
    if (entry.status !== "closed" || !entry.exit_date || entry.pnl == null) continue;
    const date = entry.exit_date.slice(0, 10);
    const bucket = byDate.get(date) ?? { pnl: 0, trades: 0 };
    bucket.pnl += entry.pnl;
    bucket.trades += 1;
    byDate.set(date, bucket);
  }
  return Array.from(byDate.entries())
    .map(([date, value]) => ({ date, pnl: value.pnl, trades: value.trades }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function journalCalendarYears(days: JournalDayPnl[]): number[] {
  const years = new Set<number>();
  for (const day of days) {
    years.add(Number(day.date.slice(0, 4)));
  }
  return Array.from(years).sort((a, b) => b - a);
}

export type JournalCalendarCell = {
  date: string | null;
  pnl: number | null;
  trades: number;
  inRange: boolean;
};

/** Build a GitHub-style grid: 52 weeks × 7 days ending on the latest Sunday in range. */
export function buildJournalCalendarGrid(
  days: JournalDayPnl[],
  options?: { months?: number; year?: number | null },
): { cells: JournalCalendarCell[][]; pnlMin: number; pnlMax: number } {
  const months = options?.months ?? 12;
  const byDate = new Map(days.map((day) => [day.date, day]));
  const end = new Date();
  end.setHours(12, 0, 0, 0);
  const start = new Date(end);
  start.setMonth(start.getMonth() - months);
  start.setHours(12, 0, 0, 0);

  const yearFilter = options?.year ?? null;
  const gridStart = new Date(start);
  while (gridStart.getDay() !== 0) {
    gridStart.setDate(gridStart.getDate() - 1);
  }

  const cells: JournalCalendarCell[][] = [];
  let pnlMin = 0;
  let pnlMax = 0;
  const cursor = new Date(gridStart);

  for (let week = 0; week < 52; week += 1) {
    const column: JournalCalendarCell[] = [];
    for (let dow = 0; dow < 7; dow += 1) {
      const iso = cursor.toISOString().slice(0, 10);
      const inRange = cursor >= start && cursor <= end;
      const yearOk = yearFilter == null || cursor.getFullYear() === yearFilter;
      const day = byDate.get(iso);
      const pnl = day?.pnl ?? null;
      if (pnl != null) {
        pnlMin = Math.min(pnlMin, pnl);
        pnlMax = Math.max(pnlMax, pnl);
      }
      column.push({
        date: inRange && yearOk ? iso : null,
        pnl: inRange && yearOk ? pnl : null,
        trades: inRange && yearOk ? (day?.trades ?? 0) : 0,
        inRange: inRange && yearOk,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    cells.push(column);
  }

  return { cells, pnlMin, pnlMax };
}

export function journalCalendarCellColor(
  pnl: number | null,
  pnlMin: number,
  pnlMax: number,
): string {
  if (pnl == null) return "rgba(255,255,255,0.04)";
  if (pnl === 0) return "rgba(255,255,255,0.08)";
  if (pnl > 0) {
    const ratio = pnlMax > 0 ? pnl / pnlMax : 1;
    const alpha = 0.22 + ratio * 0.58;
    return `rgba(45, 181, 116, ${alpha.toFixed(2)})`;
  }
  const ratio = pnlMin < 0 ? pnl / pnlMin : 1;
  const alpha = 0.22 + ratio * 0.58;
  return `rgba(229, 56, 59, ${alpha.toFixed(2)})`;
}
