import { describe, expect, it } from "vitest";
import { parseTradeReportCsv, sampleTradeReportCsv } from "@/lib/trade-report-import";

describe("trade report import", () => {
  it("parses a generic completed-trade CSV and computes trader analytics", () => {
    const result = parseTradeReportCsv(sampleTradeReportCsv());

    expect(result.summary.parsedTrades).toBe(4);
    expect(result.summary.rejectedRows).toBe(0);
    expect(result.summary.totalPnl).toBe(1990);
    expect(result.summary.wins).toBe(3);
    expect(result.summary.losses).toBe(1);
    expect(result.summary.winRate).toBe(75);
    expect(result.summary.profitFactor).toBeCloseTo(8.11, 2);
    expect(result.summary.bestTrade?.symbol).toBe("AUBANK");
    expect(result.summary.worstTrade?.symbol).toBe("TCS");
    expect(result.summary.symbolBreakdown[0]).toMatchObject({ symbol: "AUBANK", pnl: 1160 });
  });

  it("calculates P&L from entry, exit, quantity, and side when no P&L column exists", () => {
    const result = parseTradeReportCsv(`Trading Symbol,Buy Date,Sell Date,Type,Qty,Buy Average,Sell Average
RELIANCE,01/05/2026,06/05/2026,buy,10,100,110
INFY,02/05/2026,03/05/2026,short,5,1500,1480`);

    expect(result.summary.parsedTrades).toBe(2);
    expect(result.summary.totalPnl).toBe(200);
    expect(result.trades[0]).toMatchObject({ symbol: "RELIANCE", pnl: 100, entryDate: "2026-05-01" });
    expect(result.trades[1]).toMatchObject({ symbol: "INFY", pnl: 100, tradeType: "short" });
  });

  it("reports rejected rows instead of silently accepting unusable data", () => {
    const result = parseTradeReportCsv(`symbol,entry_date,quantity
RELIANCE,2026-05-01,10
,2026-05-02,4`);

    expect(result.summary.parsedTrades).toBe(0);
    expect(result.summary.rejectedRows).toBe(2);
    expect(result.rejected.map((row) => row.reason)).toEqual([
      "Missing P&L or entry/exit price data",
      "Missing symbol column",
    ]);
  });
});
