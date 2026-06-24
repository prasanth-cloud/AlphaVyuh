import { describe, expect, it } from "vitest";
import {
  buildJournalDailyPnl,
  journalCalendarCellColor,
} from "@/lib/journal-calendar";
import {
  formatSetupTagDisplay,
  normalizeSetupTagForSave,
} from "@/lib/setup-tag-display";
import { displayCompanyName } from "@/lib/company-display";

describe("formatSetupTagDisplay", () => {
  it("title-cases mixed setup tags", () => {
    expect(formatSetupTagDisplay("breakout")).toBe("Breakout");
    expect(formatSetupTagDisplay("vcp")).toBe("Vcp");
    expect(formatSetupTagDisplay("Broker report")).toBe("Broker Report");
  });

  it("normalizes saves to lowercase", () => {
    expect(normalizeSetupTagForSave("Breakout")).toBe("breakout");
    expect(normalizeSetupTagForSave("  VCP  ")).toBe("vcp");
    expect(normalizeSetupTagForSave("")).toBeNull();
  });
});

describe("buildJournalDailyPnl", () => {
  it("aggregates closed trade P&L by exit date", () => {
    const rows = buildJournalDailyPnl([
      { status: "closed", exit_date: "2026-05-01", pnl: 100 },
      { status: "closed", exit_date: "2026-05-01", pnl: -40 },
      { status: "open", exit_date: "2026-05-02", pnl: 50 },
    ]);
    expect(rows).toEqual([{ date: "2026-05-01", pnl: 60, trades: 2 }]);
  });
});

describe("journalCalendarCellColor", () => {
  it("returns neutral for empty days and green/red for P&L", () => {
    expect(journalCalendarCellColor(null, -100, 100)).toContain("255");
    expect(journalCalendarCellColor(50, -100, 100)).toContain("45, 181, 116");
    expect(journalCalendarCellColor(-50, -100, 100)).toContain("229, 56, 59");
  });
});

describe("displayCompanyName in journal rows", () => {
  it("hides duplicate ticker names", () => {
    expect(displayCompanyName("SMARTWORKS", "SMARTWORKS")).toBe("");
    expect(displayCompanyName("TCS", "Tata Consultancy Services")).toBe("Tata Consultancy Services");
  });
});
