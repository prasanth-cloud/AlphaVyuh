"use client";

import { useMemo, useState } from "react";
import {
  buildJournalCalendarGrid,
  buildJournalDailyPnl,
  journalCalendarCellColor,
  journalCalendarYears,
} from "@/lib/journal-calendar";
import type { JournalEntry } from "./types";

type JournalCalendarHeatmapProps = {
  entries: JournalEntry[];
  onSelectDate: (date: string) => void;
};

function formatDayPnl(pnl: number): string {
  const sign = pnl > 0 ? "+" : pnl < 0 ? "-" : "";
  return `${sign}₹${Math.abs(pnl).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function JournalCalendarHeatmap({ entries, onSelectDate }: JournalCalendarHeatmapProps) {
  const daily = useMemo(() => buildJournalDailyPnl(entries), [entries]);
  const years = useMemo(() => journalCalendarYears(daily), [daily]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  const { cells, pnlMin, pnlMax } = useMemo(
    () => buildJournalCalendarGrid(daily, { year: selectedYear }),
    [daily, selectedYear],
  );

  if (daily.length === 0) return null;

  return (
    <div data-testid="journal-calendar-heatmap">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div>
          <h2 className="heading-card" style={{ marginBottom: 4 }}>Trading calendar</h2>
          <div className="caption">Daily realised P&amp;L from closed trades — last 12 months</div>
        </div>
        {years.length > 1 && (
          <select
            value={selectedYear ?? ""}
            onChange={(e) => setSelectedYear(e.target.value ? Number(e.target.value) : null)}
            aria-label="Calendar year"
            style={{ fontSize: 11, padding: "7px 10px", borderRadius: 999, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", color: "var(--text-secondary)" }}
          >
            <option value="">Last 12 months</option>
            {years.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        )}
      </div>
      <div className="journal-calendar-grid" role="grid" aria-label="Trading calendar heatmap">
        {cells.map((week, weekIndex) => (
          <div key={weekIndex} className="journal-calendar-week" role="row">
            {week.map((cell, dayIndex) => {
              if (!cell.inRange || !cell.date) {
                return <div key={`${weekIndex}-${dayIndex}`} className="journal-calendar-cell journal-calendar-cell-empty" aria-hidden />;
              }
              const title = cell.pnl == null
                ? `${cell.date} · No trades`
                : `${cell.date} · ${formatDayPnl(cell.pnl)} · ${cell.trades} trade${cell.trades === 1 ? "" : "s"}`;
              return (
                <button
                  key={cell.date}
                  type="button"
                  className="journal-calendar-cell"
                  style={{ background: journalCalendarCellColor(cell.pnl, pnlMin, pnlMax) }}
                  title={title}
                  aria-label={title}
                  onClick={() => onSelectDate(cell.date!)}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="journal-calendar-legend caption" style={{ marginTop: 10, color: "var(--text-tertiary)" }}>
        Darker green = stronger positive day · Darker red = larger loss · Click a day to filter trades
      </div>
    </div>
  );
}
